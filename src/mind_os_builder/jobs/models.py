from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from mind_os_builder.core.results import RunStatus


class JobSchemaError(ValueError):
    pass


def _required(mapping: Mapping[str, Any], name: str) -> Any:
    if name not in mapping:
        raise JobSchemaError(f"missing required field: {name}")
    return mapping[name]


def _string_list(mapping: Mapping[str, Any], name: str, *, nonempty: bool = False) -> tuple[str, ...]:
    value = _required(mapping, name)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise JobSchemaError(f"{name} must be a list of strings")
    if nonempty and not value:
        raise JobSchemaError(f"{name} must not be empty")
    return tuple(value)


@dataclass(frozen=True, slots=True)
class JobDefinition:
    api_version: str
    id: str
    action: str
    inputs: Mapping[str, Any]
    outputs: tuple[str, ...]
    effects: tuple[str, ...]
    default_mode: str
    concurrency_key: str
    timeout_seconds: float
    retry_attempts: int
    success_statuses: tuple[RunStatus, ...]
    required_capabilities: tuple[str, ...]
    required_secrets: tuple[str, ...]
    schedule_hint: str
    timezone: str

    @classmethod
    def from_mapping(cls, payload: Mapping[str, Any]) -> JobDefinition:
        inputs = _required(payload, "inputs")
        if not isinstance(inputs, Mapping):
            raise JobSchemaError("inputs must be a mapping")
        retry = _required(payload, "retry")
        if not isinstance(retry, Mapping):
            raise JobSchemaError("retry must be a mapping")
        retry_attempts = retry.get("attempts")
        if not isinstance(retry_attempts, int) or retry_attempts < 1:
            raise JobSchemaError("retry.attempts must be a positive integer")
        timeout = _required(payload, "timeout_seconds")
        if not isinstance(timeout, (int, float)) or timeout <= 0:
            raise JobSchemaError("timeout_seconds must be positive")
        concurrency_key = _required(payload, "concurrency_key")
        if not isinstance(concurrency_key, str) or not concurrency_key.strip():
            raise JobSchemaError("concurrency_key must not be empty")
        statuses_raw = _string_list(payload, "success_statuses", nonempty=True)
        try:
            statuses = tuple(RunStatus(item) for item in statuses_raw)
        except ValueError as exc:
            raise JobSchemaError("success_statuses contains an unknown status") from exc
        default_mode = str(_required(payload, "default_mode"))
        if default_mode not in {"dry-run", "apply"}:
            raise JobSchemaError("default_mode must be dry-run or apply")
        return cls(
            api_version=str(_required(payload, "api_version")),
            id=str(_required(payload, "id")),
            action=str(_required(payload, "action")),
            inputs=dict(inputs),
            outputs=_string_list(payload, "outputs", nonempty=True),
            effects=_string_list(payload, "effects", nonempty=True),
            default_mode=default_mode,
            concurrency_key=concurrency_key,
            timeout_seconds=float(timeout),
            retry_attempts=retry_attempts,
            success_statuses=statuses,
            required_capabilities=_string_list(payload, "required_capabilities"),
            required_secrets=_string_list(payload, "required_secrets"),
            schedule_hint=str(_required(payload, "schedule_hint")),
            timezone=str(_required(payload, "timezone")),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "api_version": self.api_version,
            "id": self.id,
            "action": self.action,
            "inputs": dict(self.inputs),
            "outputs": list(self.outputs),
            "effects": list(self.effects),
            "default_mode": self.default_mode,
            "concurrency_key": self.concurrency_key,
            "timeout_seconds": self.timeout_seconds,
            "retry": {"attempts": self.retry_attempts},
            "success_statuses": [status.value for status in self.success_statuses],
            "required_capabilities": list(self.required_capabilities),
            "required_secrets": list(self.required_secrets),
            "schedule_hint": self.schedule_hint,
            "timezone": self.timezone,
        }
