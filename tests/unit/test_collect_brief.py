from datetime import date

from mind_os_builder.collect.models import Signal
from mind_os_builder.collect.renderers.brief import render_brief, validate_brief


def test_validate_brief_rejects_metadata_count_that_disagrees_with_body() -> None:
    signal = Signal(
        id="signal-1",
        source="rss",
        title="Synthetic entry",
        content="Synthetic body.",
        url="https://example.invalid/signal-1",
    )
    markdown = render_brief([signal], generated_on=date(2026, 7, 20)).replace(
        "sources: 1", "sources: 2"
    )

    assert "source_count_mismatch:2:1" in validate_brief(markdown, [signal])
