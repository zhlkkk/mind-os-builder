from __future__ import annotations

from collections.abc import Iterable

from mind_os_builder.research.models import ResearchMode


MODE_ORDER = {
    ResearchMode.QUICK: ("search",),
    ResearchMode.STANDARD: ("search", "synthesis"),
    ResearchMode.DEEP: ("search", "deep", "synthesis"),
}


def select_providers(
    mode: ResearchMode,
    available: Iterable[str],
    requested: Iterable[str] | None = None,
) -> list[str]:
    available_set = set(available)
    if requested:
        return [name for name in requested if name in available_set]
    return [name for name in MODE_ORDER[mode] if name in available_set]
