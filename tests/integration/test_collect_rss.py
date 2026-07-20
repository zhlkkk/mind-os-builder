from __future__ import annotations

from mind_os_builder.collect.filters.rules import FilterConfig
from mind_os_builder.collect.pipeline import CollectPipeline
from mind_os_builder.collect.providers.rss_feed import RssFeedProvider


RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>Synthetic RSS</title>
  <item><guid>rss-1</guid><title>CLI release</title>
    <description><![CDATA[<p>Includes a reproducible benchmark.</p>]]></description>
    <link>https://example.invalid/rss/1</link>
    <pubDate>Sun, 19 Jul 2026 08:00:00 GMT</pubDate></item>
  <item><guid>duplicate</guid><title>Shared entry</title>
    <link>https://example.invalid/shared</link></item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Synthetic Atom</title>
  <entry><id>atom-1</id><title>Protocol update</title>
    <content type="html">&lt;b&gt;New contract&lt;/b&gt;</content>
    <link rel="alternate" href="https://example.invalid/atom/1" />
    <updated>2026-07-19T09:00:00Z</updated></entry>
  <entry><id>duplicate</id><title>Shared entry duplicate</title>
    <link href="https://example.invalid/shared" /></entry>
</feed>"""


def test_rss_provider_reads_rss_and_atom_and_keeps_partial_success() -> None:
    responses = {
        "https://example.invalid/rss.xml": RSS,
        "https://example.invalid/atom.xml": ATOM,
    }

    def fetch(url: str, timeout: float) -> bytes:
        assert timeout == 3.0
        if "slow.xml" in url:
            raise TimeoutError("synthetic timeout")
        return responses[url]

    provider = RssFeedProvider(
        tuple(responses) + ("https://reader:secret@example.invalid/slow.xml?access=secret",),
        timeout=3.0,
        fetcher=fetch,
    )

    batch = provider.fetch()

    assert [record["id"] for record in batch.records] == [
        "rss-1",
        "duplicate",
        "atom-1",
        "duplicate",
    ]
    assert batch.records[0]["content"] == "<p>Includes a reproducible benchmark.</p>"
    assert batch.records[1]["published"] is None
    assert batch.records[2]["url"] == "https://example.invalid/atom/1"
    assert batch.warnings == ("feed_timeout:https://example.invalid/slow.xml",)
    assert batch.next_cursor == "2026-07-19T09:00:00+00:00"


def test_pipeline_keeps_same_guid_from_different_feeds_and_deduplicates_within_feed(
    tmp_path,
) -> None:
    feed_a = b"""<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><guid>shared-guid</guid><title>Feed A entry</title>
    <description>First copy.</description><link>https://a.example.invalid/entry</link></item>
  <item><guid>shared-guid</guid><title>Feed A duplicate</title>
    <description>Duplicate copy.</description><link>https://a.example.invalid/duplicate</link></item>
</channel></rss>"""
    feed_b = b"""<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><guid>shared-guid</guid><title>Feed B entry</title>
    <description>Independent entry.</description><link>https://b.example.invalid/entry</link></item>
</channel></rss>"""
    responses = {
        "https://a.example.invalid/feed.xml": feed_a,
        "https://b.example.invalid/feed.xml": feed_b,
    }
    provider = RssFeedProvider(tuple(responses), fetcher=lambda url, _timeout: responses[url])
    pipeline = CollectPipeline(tmp_path / "vault", provider, FilterConfig())

    result = pipeline.run(output="raw/collect/rss-brief.md", apply=False)

    assert result.report["stages"]["fetched"] == 3
    assert result.report["stages"]["normalized"] == 2
    assert {signal.title for signal in result.signals} == {"Feed A entry", "Feed B entry"}
    assert len({signal.id for signal in result.signals}) == 2
