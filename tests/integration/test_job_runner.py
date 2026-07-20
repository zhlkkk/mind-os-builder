from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
import time
from typing import Any, Mapping

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.jobs.catalog import JobCatalog
from mind_os_builder.jobs.models import JobDefinition
from mind_os_builder.jobs.runner import CommandRegistry, JobRunner


def _job(job_id: str, key: str) -> JobDefinition:
    return JobDefinition.from_mapping(
        {
            "api_version": "mindos.dev/v1",
            "id": job_id,
            "action": f"test.{job_id}",
            "inputs": {},
            "outputs": ["run-envelope"],
            "effects": ["write:test"],
            "default_mode": "dry-run",
            "concurrency_key": key,
            "timeout_seconds": 5,
            "retry": {"attempts": 1},
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
