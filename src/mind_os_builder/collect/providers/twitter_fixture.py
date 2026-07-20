from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path

from mind_os_builder.collect.contracts import ProviderBatch, ProviderCapability, ProviderError


class TwitterFixtureProvider:
    name = "twitter-fixture"

    def __init__(self, fixture_path: Path) -> None:
        self._fixture_path = fixture_path

    @property
    def capability(self) -> ProviderCapability:
        return ProviderCapability(source="twitter", network=False, experimental=False)

    def fetch(self, cursor: str | None = None) -> ProviderBatch:
        del cursor
        payload = json.loads(self._fixture_path.read_text(encoding="utf-8"))
        if not isinstance(payload, Mapping) or not isinstance(payload.get("records"), list):
            raise ProviderError("invalid_fixture", "fixture must contain a records array")
        raw_records = payload["records"]
        if not all(isinstance(record, Mapping) for record in raw_records):
            raise ProviderError("invalid_fixture", "fixture records must be objects")
        next_cursor = payload.get("next_cursor")
        return ProviderBatch(
            records=tuple(dict(record) for record in raw_records),
            next_cursor=str(next_cursor) if next_cursor is not None else None,
        )
