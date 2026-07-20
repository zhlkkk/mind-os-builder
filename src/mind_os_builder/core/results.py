from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any
from uuid import uuid4


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    SUCCEEDED = "succeeded"
    PARTIAL = "partial"
    BLOCKED = "blocked"
    FAILED = "failed"
    TIMED_OUT = "timed_out"
    CANCELLED = "cancelled"


EXIT_CODES = {
    RunStatus.SUCCEEDED: 0,
    RunStatus.FAILED: 1,
    RunStatus.PARTIAL: 2,
    RunStatus.BLOCKED: 3,
    RunStatus.WAITING_APPROVAL: 3,
    RunStatus.TIMED_OUT: 124,
    RunStatus.CANCELLED: 130,
    RunStatus.QUEUED: 0,
    RunStatus.RUNNING: 0,
}


@dataclass(slots=True)
class RunEnvelope:
    task: str
    status: RunStatus
    run_id: str = field(default_factory=lambda: uuid4().hex)
    api_version: str = "v1"
    reason_code: str | None = None
    changed: bool = False
    artifacts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[dict[str, str]] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)

    @property
    def exit_code(self) -> int:
        return EXIT_CODES[self.status]

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["status"] = self.status.value
        return payload

    @classmethod
    def noop(cls, task: str) -> RunEnvelope:
        return cls(task=task, status=RunStatus.SUCCEEDED, reason_code="noop")

    @classmethod
    def blocked(cls, task: str, reason_code: str, message: str) -> RunEnvelope:
        return cls(
            task=task,
            status=RunStatus.BLOCKED,
            reason_code=reason_code,
            errors=[{"code": reason_code, "message": message}],
        )
