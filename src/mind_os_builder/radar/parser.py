from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

from mind_os_builder.core.read_guard import ReadGuard


LEVEL_PATTERN = re.compile(r"^###\s+([🔴🟡🟢])[^\n]*$", re.MULTILINE)
TITLE_PATTERN = re.compile(r"^\*\*([^*\n]+)\*\*\s*$", re.MULTILINE)
LATEST_PATTERN = re.compile(r"最新信号:\s*(\d{4}-\d{2}-\d{2})")
SOURCE_LINE_PATTERN = re.compile(r"^-\s*来源:\s*(.+)$", re.MULTILINE)
SOURCE_DATE_PATTERN = re.compile(r"(?<!\d)(?:(\d{4})-)?(\d{1,2})-(\d{1,2})(?!\d)")
WIKILINK_PATTERN = re.compile(r"\[\[([^]|#]+)(?:#[^]|]+)?(?:\|[^]]+)?]]")


@dataclass(frozen=True, slots=True)
class RadarConfig:
    pages: tuple[Path, ...] = ()
    hub: Path | None = None

    def __post_init__(self) -> None:
        if not self.pages and self.hub is None:
            raise ValueError("radar config requires pages or hub")


@dataclass(frozen=True, slots=True)
class RadarSignal:
    level: str
    title: str
    latest: date
    compiled: bool
    source_dates: tuple[date, ...]
    page: Path


def _resolve_link(hub: Path, target: str) -> Path:
    path = Path(target.strip())
    if path.suffix != ".md":
        path = path.with_suffix(".md")
    if len(path.parts) == 1:
        return hub.parent / path
    return path


def resolve_pages(root: Path, config: RadarConfig) -> tuple[Path, ...]:
    guard = ReadGuard(root)
    pages = [guard.relative(page) for page in config.pages]
    if config.hub is not None:
        hub = guard.relative(config.hub)
        hub_path = guard.resolve(hub)
        content = hub_path.read_text(encoding="utf-8")
        pages.extend(
            guard.relative(_resolve_link(hub, target))
            for target in WIKILINK_PATTERN.findall(content)
        )
    return tuple(
        page for page in dict.fromkeys(pages) if guard.resolve(page).is_file()
    )


def _source_date(match: re.Match[str], *, latest: date) -> date:
    year_text, month_text, day_text = match.groups()
    if year_text:
        return date(int(year_text), int(month_text), int(day_text))
    candidate = date(latest.year, int(month_text), int(day_text))
    if candidate > latest:
        candidate = date(latest.year - 1, candidate.month, candidate.day)
    return candidate


def _parse_page(relative: Path, content: str) -> list[RadarSignal]:
    results: list[RadarSignal] = []
    levels = list(LEVEL_PATTERN.finditer(content))
    for index, level_match in enumerate(levels):
        section_end = levels[index + 1].start() if index + 1 < len(levels) else len(content)
        section = content[level_match.end() : section_end]
        titles = list(TITLE_PATTERN.finditer(section))
        for title_index, title_match in enumerate(titles):
            block_end = titles[title_index + 1].start() if title_index + 1 < len(titles) else len(section)
            block = section[title_match.end() : block_end]
            latest_match = LATEST_PATTERN.search(block)
            if latest_match is None:
                continue
            latest = date.fromisoformat(latest_match.group(1))
            source_dates: set[date] = set()
            for source_line in SOURCE_LINE_PATTERN.findall(block):
                for source_match in SOURCE_DATE_PATTERN.finditer(source_line):
                    source_dates.add(_source_date(source_match, latest=latest))
            results.append(
                RadarSignal(
                    level=level_match.group(1),
                    title=title_match.group(1).strip(),
                    latest=latest,
                    compiled="→ 已编译" in block or "→ 已记录" in block,
                    source_dates=tuple(sorted(source_dates)),
                    page=relative,
                )
            )
    return results


def load_signals(root: Path, config: RadarConfig) -> list[RadarSignal]:
    guard = ReadGuard(root)
    signals: list[RadarSignal] = []
    for page in resolve_pages(root, config):
        signals.extend(_parse_page(page, guard.resolve(page).read_text(encoding="utf-8")))
    return signals
