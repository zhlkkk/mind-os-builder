from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, Sequence

from mind_os_builder.collect.models import Signal


@dataclass(frozen=True, slots=True)
class FilterConfig:
    include_any: tuple[str, ...] = ()
    exclude_any: tuple[str, ...] = ()
    weights: Mapping[str, int] = field(default_factory=dict)
    minimum_score: int = 0
    output_limit: int | None = None


@dataclass(frozen=True, slots=True)
class FilterResult:
    accepted: tuple[Signal, ...]
    reasons: Mapping[str, tuple[str, ...]]
    scores: Mapping[str, int]
    counts: Mapping[str, int]


def filter_signals(signals: Sequence[Signal], config: FilterConfig) -> FilterResult:
    candidates: list[tuple[Signal, int]] = []
    reasons: dict[str, tuple[str, ...]] = {}
    scores: dict[str, int] = {}
    include_terms = tuple((term, term.casefold()) for term in config.include_any)
    exclude_terms = tuple((term, term.casefold()) for term in config.exclude_any)
    weighted_terms = tuple((term.casefold(), weight) for term, weight in config.weights.items())

    for signal in signals:
        text = signal.searchable_text()
        include_matches = [term for term, folded in include_terms if folded in text]
        exclude_matches = [term for term, folded in exclude_terms if folded in text]
        score = sum(weight for folded, weight in weighted_terms if folded in text)
        scores[signal.id] = score
        rejected: list[str] = []
        if exclude_matches:
            rejected.extend(f"excluded:{term}" for term in exclude_matches)
        else:
            if config.include_any and not include_matches:
                rejected.append("missing_include")
            if score < config.minimum_score:
                rejected.append(f"below_score:{score}<{config.minimum_score}")
        if rejected:
            reasons[signal.id] = tuple(rejected)
        else:
            candidates.append((signal, score))

    candidates.sort(key=lambda item: -item[1])
    limit = config.output_limit if config.output_limit is not None else len(candidates)
    accepted = candidates[: max(0, limit)]
    for signal, _score in candidates[max(0, limit) :]:
        reasons[signal.id] = ("output_limit",)

    return FilterResult(
        accepted=tuple(signal for signal, _score in accepted),
        reasons=reasons,
        scores=scores,
        counts={
            "input": len(signals),
            "accepted": len(accepted),
            "filtered": len(signals) - len(accepted),
        },
    )
