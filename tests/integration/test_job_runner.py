from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
import time
from typing import Any, Mapping

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.jobs.catalog import JobCatalog
from mind_os_builder.jobs.models import JobDefinition
from mind_os_builder.jobs.runner import CommandRegistry, JobRunner


def _job(
    job_id: str,
    key: str,
    *,
    inputs: Mapping[str, Any] | None = None,
    attempts: int = 1,
) -> JobDefinition:
    return JobDefinition.from_mapping(
        {
            "api_version": "mindos.dev/v1",
            "id": job_id,
            "action": f"test.{job_id}",
            "inputs": inputs or {},
            "outputs": ["run-envelope"],
            "effects": ["write:test"],
            "default_mode": "dry-run",
            "concurrency_key": key,
            "timeout_seconds": 5,
            "retry": {"attempts": attempts},
            "success_statuses": ["succeeded"],
            "required_capabilities": [],
            "required_secrets": [],
            "schedule_hint": "manual",
            "timezone": "UTC",
        }
    )


def test_unknown_job_returns_config_error() -> None:
    runner = JobRunner(JobCatalog({}), CommandRegistry({}))

    result = runner.run("missing", {})

    assert result.status is RunStatus.BLOCKED
    assert result.reason_code == "config_error"


def test_unregistered_action_returns_config_error() -> None:
    job = _job("missing-action", "vault:one")
    runner = JobRunner(JobCatalog({job.id: job}), CommandRegistry({}))

    result = runner.run(job.id, {})

    assert result.status is RunStatus.BLOCKED
    assert result.reason_code == "config_error"


def test_runner_binds_job_to_registered_command_service() -> None:
    seen: list[Mapping[str, Any]] = []

    def command(inputs: Mapping[str, Any]) -> RunEnvelope:
        seen.append(inputs)
        return RunEnvelope(task="direct", status=RunStatus.SUCCEEDED, metrics={"value": 7})

    job = _job("one", "vault:one")
    runner = JobRunner(JobCatalog({job.id: job}), CommandRegistry({job.action: command}))

    result = runner.run("one", {"topic": "agents"}, apply=True)

    assert result.metrics == {"value": 7}
    assert seen == [{"topic": "agents", "apply": True}]


def test_runner_validates_required_inputs_before_enqueueing() -> None:
    job = _job(
        "required",
        "vault:{root}",
        inputs={"root": {"required": True}, "mode": {"default": "standard"}},
    )
    runner = JobRunner(
        JobCatalog({job.id: job}),
        CommandRegistry({job.action: lambda _inputs: RunEnvelope.noop("unused")}),
    )

    result = runner.run(job.id, {})

    assert result.status is RunStatus.BLOCKED
    assert result.reason_code == "config_error"
    assert result.errors[0]["message"] == "missing required job inputs: root"


def test_fixed_inputs_satisfy_required_fields_and_cannot_be_overridden() -> None:
    seen: list[Mapping[str, Any]] = []

    def command(inputs: Mapping[str, Any]) -> RunEnvelope:
        seen.append(dict(inputs))
        return RunEnvelope.noop("fixed")

    job = _job("fixed", "vault:{root}", inputs={"root": {"required": True}})
    runner = JobRunner(
        JobCatalog({job.id: job}),
        CommandRegistry({job.action: command}),
        fixed_inputs={"root": "/trusted/vault"},
    )

    result = runner.run(job.id, {"root": "/untrusted/vault"})

    assert result.status is RunStatus.SUCCEEDED
    assert seen == [{"root": "/trusted/vault", "apply": False}]


def test_runner_materializes_defaults_and_preserves_request_for_each_attempt() -> None:
    seen: list[Mapping[str, Any]] = []
    key_orders: list[list[str]] = []

    def command(inputs: Mapping[str, Any]) -> RunEnvelope:
        seen.append(dict(inputs))
        key_orders.append(list(inputs))
        status = RunStatus.FAILED if len(seen) == 1 else RunStatus.SUCCEEDED
        return RunEnvelope(task="ordered", status=status)

    job = _job(
        "ordered",
        "vault:{root}:{topic}",
        inputs={
            "root": {"required": True},
            "mode": {"default": "standard"},
        },
        attempts=2,
    )
    runner = JobRunner(JobCatalog({job.id: job}), CommandRegistry({job.action: command}))

    result = runner.run(job.id, {"root": "/vault", "topic": "agents"}, apply=True)

    expected = {"root": "/vault", "mode": "standard", "topic": "agents", "apply": True}
    assert result.status is RunStatus.SUCCEEDED
    assert seen == [expected, expected]
    assert key_orders == [["root", "mode", "topic", "apply"]] * 2


def test_packaged_jobs_accept_their_declared_minimum_requests() -> None:
    catalog = JobCatalog.packaged()
    requests: dict[str, dict[str, Any]] = {
        "collect-rss": {"feeds": ["https://example.invalid/feed"]},
        "collect-twitter": {"fixture_path": "/tmp/twitter.json"},
        "distill": {"source": "journals/2026-07-20.md"},
        "lint": {},
        "tech-radar": {},
        "tech-research": {"topic": "Agent 协议"},
    }
    seen: dict[str, Mapping[str, Any]] = {}

    def service(action: str):
        def invoke(inputs: Mapping[str, Any]) -> RunEnvelope:
            seen[action] = dict(inputs)
            return RunEnvelope(task=action, status=RunStatus.SUCCEEDED)

        return invoke

    registry = CommandRegistry(
        {
            catalog.get(job_id).action: service(catalog.get(job_id).action)
            for job_id in catalog.list_ids()
        }
    )
    runner = JobRunner(catalog, registry, fixed_inputs={"root": "/trusted/vault"})

    for job_id, inputs in requests.items():
        assert runner.run(job_id, inputs).status is RunStatus.SUCCEEDED

    assert seen["collect.twitter"]["provider"] == "fixture"
    assert seen["research.run"]["mode"] == "standard"
    assert all(payload["root"] == "/trusted/vault" for payload in seen.values())
    assert all(payload["apply"] is False for payload in seen.values())


def test_packaged_jobs_report_missing_external_inputs_before_execution() -> None:
    catalog = JobCatalog.packaged()
    registry = CommandRegistry(
        {
            catalog.get(job_id).action: lambda _inputs: RunEnvelope.noop("unexpected")
            for job_id in catalog.list_ids()
        }
    )
    runner = JobRunner(catalog, registry, fixed_inputs={"root": "/trusted/vault"})

    for job_id in ("collect-rss", "collect-twitter", "distill", "tech-research"):
        result = runner.run(job_id, {})
        assert result.status is RunStatus.BLOCKED
        assert result.reason_code == "config_error"
        assert result.errors[0]["message"].startswith("missing required job inputs:")

    for job_id in ("lint", "tech-radar"):
        assert runner.run(job_id, {}).status is RunStatus.SUCCEEDED


def test_runner_does_not_expose_command_exception_details() -> None:
    def command(_inputs: Mapping[str, Any]) -> RunEnvelope:
        raise RuntimeError("token=synthetic-secret")

    job = _job("leaky", "vault:one")
    runner = JobRunner(JobCatalog({job.id: job}), CommandRegistry({job.action: command}))

    result = runner.run(job.id, {})

    assert result.reason_code == "command_error"
    assert "synthetic-secret" not in str(result.to_dict())


def test_same_concurrency_key_serializes_but_distinct_keys_can_overlap() -> None:
    state_lock = Lock()
    active_by_key: dict[str, int] = {}
    max_by_key: dict[str, int] = {}
    globally_active = 0
    global_max = 0

    def command(inputs: Mapping[str, Any]) -> RunEnvelope:
        nonlocal globally_active, global_max
        key = str(inputs["key"])
        with state_lock:
            active_by_key[key] = active_by_key.get(key, 0) + 1
            max_by_key[key] = max(max_by_key.get(key, 0), active_by_key[key])
            globally_active += 1
            global_max = max(global_max, globally_active)
        time.sleep(0.05)
        with state_lock:
            active_by_key[key] -= 1
            globally_active -= 1
        return RunEnvelope(task=key, status=RunStatus.SUCCEEDED)

    same_a = _job("same-a", "shared")
    same_b = _job("same-b", "shared")
    other = _job("other", "other")
    commands = {job.action: command for job in (same_a, same_b, other)}
    runner = JobRunner(JobCatalog({job.id: job for job in (same_a, same_b, other)}), CommandRegistry(commands))
    barrier = Barrier(3)

    def invoke(job_id: str, key: str) -> RunEnvelope:
        barrier.wait()
        return runner.run(job_id, {"key": key})

    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda pair: invoke(*pair), [("same-a", "shared"), ("same-b", "shared"), ("other", "other")]))

    assert all(result.status is RunStatus.SUCCEEDED for result in results)
    assert max_by_key["shared"] == 1
    assert global_max >= 2
