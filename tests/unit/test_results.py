from mind_os_builder.core.results import RunEnvelope, RunStatus


def test_reason_code_is_separate_from_public_status() -> None:
    result = RunEnvelope(task="wiki.init", status=RunStatus.BLOCKED, reason_code="conflict")
    payload = result.to_dict()
    assert payload["status"] == "blocked"
    assert payload["reason_code"] == "conflict"
    assert result.exit_code == 3


def test_noop_is_a_successful_unchanged_result() -> None:
    result = RunEnvelope.noop("wiki.init")
    assert result.status is RunStatus.SUCCEEDED
    assert result.reason_code == "noop"
    assert result.changed is False
