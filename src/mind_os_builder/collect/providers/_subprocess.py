from __future__ import annotations

import json
import subprocess
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from mind_os_builder.collect.contracts import ProviderBatch, ProviderError

Runner = Callable[[tuple[str, ...], float], subprocess.CompletedProcess[str]]


def default_runner(command: tuple[str, ...], timeout: float) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603
        command,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def run_json_command(
    command: tuple[str, ...],
    *,
    timeout: float,
    runner: Runner,
    record_keys: Sequence[str],
) -> ProviderBatch:
    try:
        completed = runner(command, timeout)
    except FileNotFoundError as exc:
        raise ProviderError("unavailable", "provider command is not installed") from exc
    except subprocess.TimeoutExpired as exc:
        raise ProviderError("timeout", "provider command timed out") from exc

    if completed.returncode != 0:
        error_text = completed.stderr.casefold()
        if "401" in error_text or "unauthorized" in error_text or "auth" in error_text:
            code = "authentication"
        elif "429" in error_text or "rate limit" in error_text:
            code = "rate_limited"
        elif "budget" in error_text or "quota" in error_text:
            code = "budget_exhausted"
        else:
            code = "command_failed"
        raise ProviderError(code, f"provider command failed: {code}")

    try:
        payload: Any = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise ProviderError("invalid_json", "provider returned invalid JSON") from exc
    if isinstance(payload, list):
        if not all(isinstance(item, Mapping) for item in payload):
            raise ProviderError("invalid_payload", "provider records must be objects")
        return ProviderBatch(records=tuple(dict(item) for item in payload))
    if not isinstance(payload, Mapping):
        raise ProviderError("invalid_payload", "provider JSON must be an object or array")

    raw_records: object = ()
    for key in record_keys:
        if key in payload:
            raw_records = payload[key]
            break
    if not isinstance(raw_records, list) or not all(isinstance(item, Mapping) for item in raw_records):
        raise ProviderError("invalid_payload", "provider records must be an array of objects")
    records = tuple(dict(item) for item in raw_records)
    cursor = payload.get("next_cursor", payload.get("cursor"))
    return ProviderBatch(records=records, next_cursor=str(cursor) if cursor is not None else None)
