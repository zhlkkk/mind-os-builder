from __future__ import annotations

import re
from datetime import date
from typing import Sequence

from mind_os_builder.collect.models import Signal

_SIGNAL_ID = re.compile(r"<!--\s*signal-id:([^\s]+)\s*-->")
_SOURCES = re.compile(r"(?m)^sources:\s*(\d+)\s*$")
_UPDATED = re.compile(r"(?m)^updated:\s*([^\s]+)\s*$")


def existing_signal_ids(markdown: str) -> set[str]:
    return set(_SIGNAL_ID.findall(markdown))


def _item(signal: Signal) -> str:
    summary = signal.content or signal.title
    author = f" · {signal.author}" if signal.author else ""
    return (
        f"## {signal.title or '未命名信号'}\n"
        f"<!-- signal-id:{signal.id} -->\n"
        f"[{signal.source}{author}]({signal.url})\n\n"
        f"{summary}\n"
    )


def render_brief(signals: Sequence[Signal], *, generated_on: date | None = None) -> str:
    current = generated_on or date.today()
    header = (
        "---\n"
        "domain: collect\n"
        f"sources: {len(signals)}\n"
        f"created: {current.isoformat()}\n"
        f"updated: {current.isoformat()}\n"
        "tags: [collect]\n"
        "---\n\n"
        f"# 采集简报 · {current.isoformat()}\n\n"
    )
    return header + "\n".join(_item(signal) for signal in signals)


def merge_brief(
    existing: str,
    signals: Sequence[Signal],
    *,
    generated_on: date | None = None,
) -> tuple[str, tuple[Signal, ...]]:
    known = existing_signal_ids(existing)
    additions = tuple(signal for signal in signals if signal.id not in known)
    if not additions:
        return existing, ()
    suffix = "\n".join(_item(signal) for signal in additions)
    merged = existing.rstrip() + "\n\n" + suffix
    current = generated_on or date.today()
    merged = _replace_frontmatter_value(merged, _SOURCES, f"sources: {len(existing_signal_ids(merged))}")
    merged = _replace_frontmatter_value(merged, _UPDATED, f"updated: {current.isoformat()}")
    return merged, additions


def validate_brief(markdown: str, signals: Sequence[Signal]) -> tuple[str, ...]:
    errors: list[str] = []
    if not markdown.startswith("---\n") or "\ndomain: collect\n" not in markdown:
        errors.append("missing_frontmatter")
    ids = _SIGNAL_ID.findall(markdown)
    sources = _SOURCES.search(_frontmatter(markdown))
    if sources is None:
        errors.append("missing_sources_count")
    elif int(sources.group(1)) != len(set(ids)):
        errors.append(f"source_count_mismatch:{sources.group(1)}:{len(set(ids))}")
    if len(ids) != len(set(ids)):
        errors.append("duplicate_signal_reference")
    updated = _UPDATED.search(_frontmatter(markdown))
    if updated is None:
        errors.append("missing_updated")
    else:
        try:
            date.fromisoformat(updated.group(1))
        except ValueError:
            errors.append("invalid_updated")
    for signal in signals:
        if not signal.url.startswith(("https://", "http://")):
            errors.append(f"missing_source_url:{signal.id}")
        if f"signal-id:{signal.id}" not in markdown:
            errors.append(f"missing_signal_reference:{signal.id}")
    return tuple(errors)


def _frontmatter(markdown: str) -> str:
    if not markdown.startswith("---\n"):
        return ""
    end = markdown.find("\n---\n", 4)
    return markdown[4:end] if end != -1 else ""


def _replace_frontmatter_value(markdown: str, pattern: re.Pattern[str], replacement: str) -> str:
    end = markdown.find("\n---\n", 4)
    if not markdown.startswith("---\n") or end == -1:
        return markdown
    frontmatter = markdown[:end]
    if pattern.search(frontmatter) is None:
        frontmatter = f"{frontmatter}\n{replacement}"
    else:
        frontmatter = pattern.sub(replacement, frontmatter, count=1)
    return frontmatter + markdown[end:]
