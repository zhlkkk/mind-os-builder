from __future__ import annotations

import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable
from datetime import datetime
from email.utils import parsedate_to_datetime
from urllib.parse import urlsplit, urlunsplit

from mind_os_builder.collect.contracts import ProviderBatch, ProviderCapability

Fetcher = Callable[[str, float], bytes]


def _safe_feed_label(url: str) -> str:
    parsed = urlsplit(url)
    hostname = parsed.hostname or "feed"
    try:
        port = f":{parsed.port}" if parsed.port is not None else ""
    except ValueError:
        port = ""
    return urlunsplit((parsed.scheme, hostname + port, parsed.path, "", ""))


def _download(url: str, timeout: float) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "mind-os-builder/0.1"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310
        return bytes(response.read())


def _text(element: ET.Element, names: tuple[str, ...]) -> str | None:
    for name in names:
        child = element.find(name)
        if child is not None and child.text:
            return child.text.strip()
    return None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            return parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None


def _rss_records(root: ET.Element) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for item in root.findall("./channel/item"):
        records.append(
            {
                "id": _text(item, ("guid",)) or _text(item, ("link",)),
                "title": _text(item, ("title",)),
                "content": _text(item, ("description", "content")),
                "url": _text(item, ("link",)),
                "author": _text(item, ("author",)),
                "published": _text(item, ("pubDate", "date")),
            }
        )
    return records


def _atom_records(root: ET.Element) -> list[dict[str, object]]:
    namespace = "{http://www.w3.org/2005/Atom}"
    records: list[dict[str, object]] = []
    for entry in root.findall(f"{namespace}entry"):
        link = ""
        for element in entry.findall(f"{namespace}link"):
            if element.attrib.get("rel", "alternate") == "alternate":
                link = element.attrib.get("href", "")
                break
        records.append(
            {
                "id": _text(entry, (f"{namespace}id",)) or link,
                "title": _text(entry, (f"{namespace}title",)),
                "content": _text(entry, (f"{namespace}content", f"{namespace}summary")),
                "url": link,
                "author": _text(entry, (f"{namespace}author/{namespace}name",)),
                "published": _text(
                    entry,
                    (f"{namespace}published", f"{namespace}updated"),
                ),
            }
        )
    return records


class RssFeedProvider:
    name = "rss"

    def __init__(
        self,
        feed_urls: tuple[str, ...],
        *,
        timeout: float = 10.0,
        fetcher: Fetcher = _download,
    ) -> None:
        self._feed_urls = feed_urls
        self._timeout = timeout
        self._fetcher = fetcher

    @property
    def capability(self) -> ProviderCapability:
        return ProviderCapability(source="rss", network=True, experimental=False)

    def fetch(self, cursor: str | None = None) -> ProviderBatch:
        del cursor
        records: list[dict[str, object]] = []
        warnings: list[str] = []
        dates: list[datetime] = []
        for url in self._feed_urls:
            try:
                root = ET.fromstring(self._fetcher(url, self._timeout))
                feed_records = _atom_records(root) if root.tag.endswith("feed") else _rss_records(root)
            except (TimeoutError, urllib.error.URLError):
                warnings.append(f"feed_timeout:{_safe_feed_label(url)}")
                continue
            except ET.ParseError:
                warnings.append(f"feed_invalid_xml:{_safe_feed_label(url)}")
                continue
            for record in feed_records:
                published = _parse_datetime(str(record.get("published") or ""))
                if published is not None:
                    dates.append(published)
            records.extend(feed_records)
        next_cursor = max(dates).isoformat() if dates else None
        return ProviderBatch(tuple(records), next_cursor=next_cursor, warnings=tuple(warnings))
