from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ResearchMode(str, Enum):
    QUICK = "quick"
    STANDARD = "standard"
    DEEP = "deep"


class ProviderStatus(str, Enum):
    SUCCEEDED = "succeeded"
    SKIPPED = "skipped"
    FAILED = "failed"


@dataclass(frozen=True, slots=True)
class ResearchRequest:
    topic: str
    mode: ResearchMode = ResearchMode.STANDARD
    focus: str = ""
    requested_providers: tuple[str, ...] = ()
    context: str = ""


@dataclass(slots=True)
class ProviderResult:
    name: str
    status: ProviderStatus
    content: str
    citations: list[str] = field(default_factory=list)
    error: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.status is ProviderStatus.SUCCEEDED


@dataclass(frozen=True, slots=True)
class ResearchEvent:
    stage: str
    provider: str | None = None
    message: str = ""
