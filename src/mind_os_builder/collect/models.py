from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from typing import Any, Iterable, Mapping


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def plain_text(value: object) -> str:
    parser = _TextExtractor()
    parser.feed(str(value or ""))
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()


def _published_at(value: object) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            return parsedate_to_datetime(text)
        except (TypeError, ValueError, OverflowError):
            return None


@dataclass(frozen=True, slots=True)
class Signal:
    id: str
    source: str
    title: str
    content: str
    url: str
    author: str = ""
    published_at: datetime | None = None
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def searchable_text(self) -> str:
        return f"{self.title}\n{self.content}\n{self.author}".casefold()

    def to_dict(self) -> dict[str, Any]:
        result = asdict(self)
        result["published_at"] = self.published_at.isoformat() if self.published_at else None
        return result


def normalize_records(source: str, records: Iterable[Mapping[str, Any]]) -> list[Signal]:
    normalized: list[Signal] = []
    for record in records:
        title = plain_text(record.get("title"))
        content = plain_text(record.get("content") or record.get("text") or record.get("summary"))
        url = str(record.get("url") or record.get("link") or "").strip()
        raw_id = str(record.get("id") or record.get("guid") or "").strip()
        identity = raw_id or hashlib.sha256(f"{source}\0{url}\0{title}".encode()).hexdigest()[:24]
        known = {
            "id",
            "guid",
            "title",
            "content",
            "text",
            "summary",
            "url",
            "link",
            "author",
            "published_at",
            "published",
        }
        normalized.append(
            Signal(
                id=identity,
                source=source,
                title=title,
                content=content,
                url=url,
                author=plain_text(record.get("author")),
                published_at=_published_at(record.get("published_at") or record.get("published")),
                metadata={key: value for key, value in record.items() if key not in known},
            )
        )
    return normalized
