from __future__ import annotations

import pytest

from mind_os_builder.collect.filters.llm_review import ReviewUnavailable, review_signals
from mind_os_builder.collect.models import normalize_records


class UnavailableReviewer:
    def review(self, signals):
        del signals
        raise ReviewUnavailable("synthetic outage")


def test_llm_review_unavailable_can_degrade_with_an_explicit_warning() -> None:
    signals = normalize_records(
        "rss",
        ({"id": "one", "title": "Signal", "url": "https://example.invalid/one"},),
    )

    result = review_signals(signals, UnavailableReviewer(), unavailable="heuristic")

    assert result.accepted == tuple(signals)
    assert result.warnings == ("llm_review_unavailable:heuristic_fallback",)


def test_llm_review_unavailable_can_fail_closed() -> None:
    signals = normalize_records(
        "rss",
        ({"id": "one", "title": "Signal", "url": "https://example.invalid/one"},),
    )

    with pytest.raises(ReviewUnavailable):
        review_signals(signals, UnavailableReviewer(), unavailable="fail")
