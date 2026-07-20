from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class ResearchMode(str, Enum):
    QUICK = "quick"
    STANDARD = "standard"
    DEEP = "deep"


@dataclass(frozen=True, slots=True)
class ResearchRequest:
    topic: str
    mode: ResearchMode = ResearchMode.STANDARD
    focus: str = ""
    requested_providers: tuple[str, ...] = ()


@dataclass(slots=True)
class ProviderResult:
    name: str
    ok: bool
    content: str
    citations: list[str] = field(default_factory=list)
    error: str | None = None
    metadata: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class ResearchEvent:
    stage: str
    provider: str | None = None
    message: str = ""
