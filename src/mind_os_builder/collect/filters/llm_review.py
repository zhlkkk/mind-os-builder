from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Protocol, Sequence

from mind_os_builder.collect.models import Signal


class ReviewUnavailable(RuntimeError):
    pass


class Reviewer(Protocol):
    def review(self, signals: Sequence[Signal]) -> Mapping[str, bool]: ...


@dataclass(frozen=True, slots=True)
class ReviewResult:
    accepted: tuple[Signal, ...]
    reasons: Mapping[str, tuple[str, ...]]
    warnings: tuple[str, ...] = ()


def review_signals(
    signals: Sequence[Signal],
    reviewer: Reviewer | None,
    *,
    unavailable: str = "heuristic",
) -> ReviewResult:
    if reviewer is None:
        return ReviewResult(tuple(signals), {})
    try:
        decisions = reviewer.review(signals)
    except ReviewUnavailable:
        if unavailable == "heuristic":
            return ReviewResult(
                tuple(signals),
                {},
                ("llm_review_unavailable:heuristic_fallback",),
            )
        raise
    accepted = tuple(signal for signal in signals if decisions.get(signal.id, False))
    reasons = {
        signal.id: ("llm_review_rejected",)
        for signal in signals
        if not decisions.get(signal.id, False)
    }
    return ReviewResult(accepted, reasons)
