from __future__ import annotations

import json

import pytest

from mind_os_builder.cli.main import _emit
from mind_os_builder.core.results import RunEnvelope, RunStatus


REQUIRED_KEYS = {
    "api_version",
    "run_id",
    "task",
    "status",
    "reason_code",
    "changed",
    "artifacts",
    "warnings",
    "errors",
    "metrics",
}


@pytest.mark.parametrize(
    ("envelope", "expected_status", "expected_reason"),
    [
        (RunEnvelope(task="demo", status=RunStatus.SUCCEEDED), "succeeded", None),
        (RunEnvelope.noop("demo"), "succeeded", "noop"),
        (RunEnvelope(task="demo", status=RunStatus.PARTIAL), "partial", None),
        (RunEnvelope.blocked("demo", "conflict", "文件基线已变化"), "blocked", "conflict"),
        (
            RunEnvelope.blocked("demo", "config_error", "配置无效"),
            "blocked",
            "config_error",
        ),
    ],
)
def test_cli_json_envelope_is_stable(
    capsys: pytest.CaptureFixture[str],
    envelope: RunEnvelope,
    expected_status: str,
    expected_reason: str | None,
) -> None:
    assert _emit(envelope, as_json=True) == envelope.exit_code
    payload = json.loads(capsys.readouterr().out)
    assert REQUIRED_KEYS <= payload.keys()
    assert payload["api_version"] == "v1"
    assert payload["status"] == expected_status
    assert payload["reason_code"] == expected_reason
