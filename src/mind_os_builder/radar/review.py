from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re
from typing import Any, Mapping

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.write_guard import WriteGuard
from mind_os_builder.radar.parser import RadarConfig, RadarSignal, load_signals


@dataclass(frozen=True, slots=True)
class RadarSuggestion:
    level: str
    title: str
    latest: date
    age_days: int
    action: str | None
    page: Path

    def to_dict(self) -> dict[str, Any]:
        return {
            "level": self.level,
            "title": self.title,
            "latest": self.latest.isoformat(),
            "age_days": self.age_days,
            "action": self.action,
            "page": self.page.as_posix(),
        }


@dataclass(frozen=True, slots=True)
class RadarReport:
    scanned: int
    active: tuple[RadarSuggestion, ...]
    near: tuple[RadarSuggestion, ...]
    actions: tuple[RadarSuggestion, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "scanned": self.scanned,
            "active": [item.to_dict() for item in self.active],
            "near": [item.to_dict() for item in self.near],
            "actions": [item.to_dict() for item in self.actions],
        }


def _merge_signals(signals: list[RadarSignal]) -> list[RadarSignal]:
    merged: dict[tuple[str, str], RadarSignal] = {}
    for signal in signals:
        key = (signal.level, signal.title)
        previous = merged.get(key)
        if previous is None:
            merged[key] = signal
            continue
        latest = max(previous.latest, signal.latest)
        merged[key] = RadarSignal(
            level=signal.level,
            title=signal.title,
            latest=latest,
            compiled=previous.compiled or signal.compiled,
            source_dates=tuple(sorted(set(previous.source_dates) | set(signal.source_dates))),
            page=signal.page if signal.latest >= previous.latest else previous.page,
        )
    return sorted(merged.values(), key=lambda item: (item.page.as_posix(), item.title))


def _action(signal: RadarSignal, *, today: date, age: int) -> str | None:
    recent_sources = {source for source in signal.source_dates if 0 <= (today - source).days <= 14}
    if signal.level == "🟡" and len(recent_sources) >= 2:
        return "promote_red"
    if age < 14:
        return None
    if signal.level == "🔴":
        return "archive_compiled" if signal.compiled else "compile_first"
    if signal.level == "🟡":
        return "demote_green"
    return "archive_faded"


def review_radar(signals: list[RadarSignal], *, today: date) -> RadarReport:
    active: list[RadarSuggestion] = []
    near: list[RadarSuggestion] = []
    actions: list[RadarSuggestion] = []
    merged = _merge_signals(signals)
    for signal in merged:
        age = (today - signal.latest).days
        action = _action(signal, today=today, age=age)
        suggestion = RadarSuggestion(signal.level, signal.title, signal.latest, age, action, signal.page)
        if action is not None:
            actions.append(suggestion)
        elif age >= 12:
            near.append(suggestion)
        else:
            active.append(suggestion)
    return RadarReport(len(merged), tuple(active), tuple(near), tuple(actions))


MARKERS = {
    "archive_compiled": "⚫ {today} 建议移入已编译归档",
    "compile_first": "⬆️ {today} 建议优先补编译",
    "demote_green": "⬇️ {today} 建议降级 → 🟢",
    "archive_faded": "⚫ {today} 建议进入消退归档",
    "promote_red": "⬆️ {today} 建议升级 → 🔴",
}


def _mark(content: str, suggestion: RadarSuggestion, today: date) -> tuple[str, bool]:
    assert suggestion.action is not None
    marker = MARKERS[suggestion.action].format(today=today.isoformat())
    if marker in content:
        return content, False
    title_pattern = re.compile(rf"(^\*\*{re.escape(suggestion.title)}\*\*\s*$)", re.MULTILINE)
    updated, count = title_pattern.subn(rf"\1\n- {marker}", content, count=1)
    return updated, count == 1


def _update_frontmatter(content: str, today: date) -> str:
    return re.sub(
        r"^(updated:\s*)\d{4}-\d{2}-\d{2}\s*$",
        rf"\g<1>{today.isoformat()}",
        content,
        count=1,
        flags=re.MULTILINE,
    )


def apply_review(root: Path, report: RadarReport, *, today: date) -> RunEnvelope:
    guard = WriteGuard(root)
    changed_pages: list[str] = []
    by_page: dict[Path, list[RadarSuggestion]] = {}
    for suggestion in report.actions:
        by_page.setdefault(suggestion.page, []).append(suggestion)
    for page, suggestions in by_page.items():
        path = root / page
        content = path.read_text(encoding="utf-8")
        changed = False
        for suggestion in suggestions:
            content, marked = _mark(content, suggestion, today)
            changed = changed or marked
        if changed:
            guard.atomic_write(page, _update_frontmatter(content, today))
            changed_pages.append(page.as_posix())

    audit_relative = Path("wiki/log.md")
    audit_key = f"### tech-radar /radar-review {today.isoformat()}"
    audit_path = root / audit_relative
    audit = audit_path.read_text(encoding="utf-8") if audit_path.exists() else "# Wiki Log\n"
    audit_changed = False
    if changed_pages and audit_key not in audit:
        entry = (
            f"\n{audit_key}\n"
            f"- [review] 扫描 {report.scanned} 条信号，{len(report.actions)} 条满阈值或升级建议，"
            f"{len(report.near)} 条临近\n"
            f"- 已标记页面: {', '.join(changed_pages)}\n"
        )
        guard.atomic_write(audit_relative, audit.rstrip() + "\n" + entry)
        audit_changed = True
    changed_any = bool(changed_pages) or audit_changed
    return RunEnvelope(
        task="radar.review",
        status=RunStatus.SUCCEEDED,
        reason_code=None if changed_any else "noop",
        changed=changed_any,
        artifacts=changed_pages + ([audit_relative.as_posix()] if audit_changed else []),
        metrics=report.to_dict(),
    )


def radar_command(inputs: Mapping[str, Any]) -> RunEnvelope:
    root = Path(str(inputs["root"]))
    pages_value = inputs.get("pages", [])
    pages = tuple(Path(str(item)) for item in pages_value) if isinstance(pages_value, list) else ()
    hub_value = inputs.get("hub")
    config = RadarConfig(pages=pages, hub=Path(str(hub_value)) if hub_value else None)
    today_value = inputs.get("today")
    today = date.fromisoformat(str(today_value)) if today_value else date.today()
    report = review_radar(load_signals(root, config), today=today)
    if bool(inputs.get("apply", False)):
        return apply_review(root, report, today=today)
    return RunEnvelope(
        task="radar.review",
        status=RunStatus.SUCCEEDED,
        reason_code="dry_run",
        metrics=report.to_dict(),
    )
