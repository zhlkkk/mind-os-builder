from __future__ import annotations

from importlib import resources
from pathlib import Path
from typing import Any, Mapping

import yaml

from mind_os_builder.jobs.models import JobDefinition, JobSchemaError


class UnknownJobError(LookupError):
    reason_code = "config_error"


class JobCatalog:
    def __init__(self, jobs: Mapping[str, JobDefinition]) -> None:
        self._jobs = dict(jobs)

    @classmethod
    def from_directory(cls, directory: Path) -> JobCatalog:
        jobs: dict[str, JobDefinition] = {}
        for path in sorted(directory.glob("*.yaml")):
            payload = yaml.safe_load(path.read_text(encoding="utf-8"))
            if not isinstance(payload, Mapping):
                raise JobSchemaError(f"job file must contain a mapping: {path}")
            job = JobDefinition.from_mapping(payload)
            if job.id in jobs:
                raise JobSchemaError(f"duplicate job id: {job.id}")
            jobs[job.id] = job
        return cls(jobs)

    @classmethod
    def packaged(cls) -> JobCatalog:
        directory = resources.files("mind_os_builder.assets").joinpath("jobs")
        jobs: dict[str, JobDefinition] = {}
        for resource in sorted(directory.iterdir(), key=lambda item: item.name):
            if not resource.name.endswith(".yaml"):
                continue
            payload: Any = yaml.safe_load(resource.read_text(encoding="utf-8"))
            if not isinstance(payload, Mapping):
                raise JobSchemaError(f"job resource must contain a mapping: {resource.name}")
            job = JobDefinition.from_mapping(payload)
            if job.id in jobs:
                raise JobSchemaError(f"duplicate job id: {job.id}")
            jobs[job.id] = job
        return cls(jobs)

    def get(self, job_id: str) -> JobDefinition:
        try:
            return self._jobs[job_id]
        except KeyError as exc:
            raise UnknownJobError(f"unknown job: {job_id}") from exc

    def list_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._jobs))

    def describe(self, job_id: str) -> dict[str, Any]:
        return self.get(job_id).to_dict()
