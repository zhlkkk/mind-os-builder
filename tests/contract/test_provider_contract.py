from __future__ import annotations

from dataclasses import dataclass

from mind_os_builder.collect.contracts import Provider, ProviderBatch, ProviderCapability


@dataclass
class SyntheticProvider:
    name: str = "synthetic"

    @property
    def capability(self) -> ProviderCapability:
        return ProviderCapability(source="synthetic", network=False, experimental=False)

    def fetch(self, cursor: str | None = None) -> ProviderBatch:
        return ProviderBatch(
            records=({"id": "signal-1", "title": "可复现的工程信号"},),
            next_cursor="cursor-2",
        )


def test_provider_contract_only_returns_records_cursor_and_warnings() -> None:
    provider: Provider = SyntheticProvider()

    batch = provider.fetch(cursor="cursor-1")

    assert batch.records == ({"id": "signal-1", "title": "可复现的工程信号"},)
    assert batch.next_cursor == "cursor-2"
    assert batch.warnings == ()
    assert provider.capability.source == "synthetic"
