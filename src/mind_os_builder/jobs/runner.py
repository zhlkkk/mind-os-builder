from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from dataclasses import dataclass
from threading import Lock
from typing import Any, Callable, Mapping
from uuid import uuid4

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.jobs.catalog import JobCatalog, UnknownJobError
from mind_os_builder.jobs.models import JobDefinition

CommandService = Callable[[Mapping[str, Any]], RunEnvelope]


class CommandRegistry:
    def __init__(self, services: Mapping[str, CommandService]) -> None:
        self._services = dict(services)

    def get(self, action: str) -> CommandService:
        try:
            return self._services[action]
        except KeyError as exc:
            raise LookupError(f"unregistered action: {action}") from exc


@dataclass(slots=True)
class _RunRecord:
    job: JobDefinition
    inputs: dict[str, Any]
    future: Future[RunEnvelope]
    result: RunEnvelope


class _FormatInputs(dict[str, Any]):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


class JobRunner:
    """可选同步参考运行层；调度器只需消费同一 Job 契约。"""

    def __init__(self, catalog: JobCatalog, registry: CommandRegistry) -> None:
        self.catalog = catalog
        self.registry = registry
        self._executor = ThreadPoolExecutor(max_workers=8, thread_name_prefix="mindos-job")
        self._state_lock = Lock()
        self._key_locks: dict[str, Lock] = {}
        self._runs: dict[str, _RunRecord] = {}

    def _lock_for(self, key: str) -> Lock:
        with self._state_lock:
            return self._key_locks.setdefault(key, Lock())

    def _execute(self, job: JobDefinition, inputs: dict[str, Any]) -> RunEnvelope:
        service = self.registry.get(job.action)
        key = job.concurrency_key.format_map(_FormatInputs(inputs))
        with self._lock_for(key):
            last: RunEnvelope | None = None
            for _attempt in range(job.retry_attempts):
                last = service(inputs)
                if last.status in job.success_statuses:
                    return last
            assert last is not None
            return last

    def start(self, job_id: str, inputs: Mapping[str, Any], *, apply: bool | None = None) -> str:
        job = self.catalog.get(job_id)
        self.registry.get(job.action)
        payload = dict(inputs)
        payload["apply"] = job.default_mode == "apply" if apply is None else apply
        run_id = uuid4().hex
        queued = RunEnvelope(task=f"job.{job_id}", status=RunStatus.QUEUED, run_id=run_id)
        future = self._executor.submit(self._execute, job, payload)
        with self._state_lock:
            self._runs[run_id] = _RunRecord(job=job, inputs=payload, future=future, result=queued)
        return run_id

    def wait(self, run_id: str) -> RunEnvelope:
        with self._state_lock:
            record = self._runs[run_id]
        try:
            result = record.future.result(timeout=record.job.timeout_seconds)
            result.run_id = run_id
        except FutureTimeoutError:
            result = RunEnvelope(
                task=f"job.{record.job.id}",
                status=RunStatus.TIMED_OUT,
                reason_code="timeout",
                run_id=run_id,
            )
        except Exception as exc:
            result = RunEnvelope(
                task=f"job.{record.job.id}",
                status=RunStatus.FAILED,
                reason_code="command_error",
                run_id=run_id,
                errors=[{"code": "command_error", "message": str(exc)}],
            )
        with self._state_lock:
            record.result = result
        return result

    def run(self, job_id: str, inputs: Mapping[str, Any], *, apply: bool | None = None) -> RunEnvelope:
        try:
            run_id = self.start(job_id, inputs, apply=apply)
        except (UnknownJobError, LookupError) as exc:
            return RunEnvelope.blocked(f"job.{job_id}", "config_error", str(exc))
        return self.wait(run_id)

    def status(self, run_id: str) -> RunEnvelope:
        with self._state_lock:
            record = self._runs[run_id]
            if record.future.running() and record.result.status is RunStatus.QUEUED:
                return RunEnvelope(task=record.result.task, status=RunStatus.RUNNING, run_id=run_id)
            if record.future.done() and record.result.status is RunStatus.QUEUED:
                try:
                    result = record.future.result()
                    result.run_id = run_id
                except Exception as exc:
                    result = RunEnvelope(
                        task=f"job.{record.job.id}",
                        status=RunStatus.FAILED,
                        reason_code="command_error",
                        run_id=run_id,
                        errors=[{"code": "command_error", "message": str(exc)}],
                    )
                record.result = result
            return record.result

    def cancel(self, run_id: str) -> bool:
        with self._state_lock:
            record = self._runs[run_id]
            cancelled = record.future.cancel()
            if cancelled:
                record.result = RunEnvelope(
                    task=f"job.{record.job.id}",
                    status=RunStatus.CANCELLED,
                    reason_code="cancelled",
                    run_id=run_id,
                )
            return cancelled

    def resume(self, run_id: str) -> str:
        with self._state_lock:
            record = self._runs[run_id]
            if record.result.status not in {RunStatus.CANCELLED, RunStatus.TIMED_OUT}:
                raise ValueError("only cancelled or timed out runs can be resumed")
            job_id = record.job.id
            inputs = {key: value for key, value in record.inputs.items() if key != "apply"}
            apply = bool(record.inputs["apply"])
        return self.start(job_id, inputs, apply=apply)

    def close(self) -> None:
        self._executor.shutdown(wait=True, cancel_futures=False)
