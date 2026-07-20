from __future__ import annotations

from typing import Protocol, runtime_checkable

from mind_os_builder.research.models import ProviderResult, ResearchRequest


@runtime_checkable
class ResearchProvider(Protocol):
    name: str

    def run(self, request: ResearchRequest) -> ProviderResult: ...
