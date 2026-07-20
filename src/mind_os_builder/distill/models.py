from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path


class Persona(str, Enum):
    LUMINA = "lumina"
    PRISM = "prism"
    VECTOR = "vector"
    NEXUS = "nexus"
    EMBER = "ember"


@dataclass(frozen=True, slots=True)
class ParagraphContext:
    before: tuple[str, ...] = ()
    after: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class DistillTrigger:
    trigger_id: str
    persona: Persona
    source_path: Path
    paragraph: str
    paragraph_occurrence: int
    context: ParagraphContext
    concurrency_key: str
    book_slug: str | None = None
    mode: str | None = None


@dataclass(frozen=True, slots=True)
class DistillPlan:
    source_path: Path
    baseline_hash: str
    triggers: tuple[DistillTrigger, ...]


@dataclass(frozen=True, slots=True)
class RoleOutput:
    trigger_id: str
    persona: Persona
    callout: str
    requested_writes: tuple[Path, ...] = ()


@dataclass(frozen=True, slots=True)
class ApplyResult:
    changed: bool
    dry_run: bool
    planned_trigger_ids: tuple[str, ...] = ()
    applied_trigger_ids: tuple[str, ...] = ()
    skipped_trigger_ids: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    artifacts: tuple[Path, ...] = ()


class DistillError(ValueError):
    """Base error for invalid Distill input or stale plans."""


class InvalidJournalPath(DistillError):
    pass


class InvalidRoleOutput(DistillError):
    pass


class DistillConflict(DistillError):
    pass
