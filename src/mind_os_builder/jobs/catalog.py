from __future__ import annotations

from importlib.resources.abc import Traversable
from pathlib import Path
from typing import Any, Iterable, Mapping

import yaml

from mind_os_builder.core.resources import resource_tree
from mind_os_builder.jobs.models import JobDefinition, JobSchemaError


class UnknownJobError(LookupError):
    reason_code = "config_error"


class JobCatalog:
    def __init__(self, jobs: Mapping[str, JobDefinition]) -> None:
        self._jobs = dict(jobs)

    @classmethod
    def _from_resources(
        cls,
        resources: Iterable[Traversable],
        *,
        kind: str,
    ) -> JobCatalog:
        jobs: dict[str, JobDefinition] = {}
        for resource in resources:
            payload: Any = yaml.safe_load(resource.read_text(encoding="utf-8"))
            if not isinstance(payload, Mapping):
                location = str(resource) if kind == "file" else resource.name
                raise JobSchemaError(f"job {kind} must contain a mapping: {location}")
            job = JobDefinition.from_mapping(payload)
            if job.id in jobs:
                raise JobSchemaError(f"duplicate job id: {job.id}")
            jobs[job.id] = job
        return cls(jobs)

    @classmethod
    def from_directory(cls, directory: Path) -> JobCatalog:
        return cls._from_resources(sorted(directory.glob("*.yaml")), kind="file")

    @classmethod
    def packaged(cls) -> JobCatalog:
        directory = resource_tree("jobs")
        resources = sorted(
            (resource for resource in directory.iterdir() if resource.name.endswith(".yaml")),
            key=lambda resource: resource.name,
        )
        return cls._from_resources(resources, kind="resource")

    def get(self, job_id: str) -> JobDefinition:
        try:
            return self._jobs[job_id]
        except KeyError as exc:
            raise UnknownJobError(f"unknown job: {job_id}") from exc

    def list_ids(self) -> tuple[str, ...]:
        return tuple(sorted(self._jobs))

    def describe(self, job_id: str) -> dict[str, Any]:
        return self.get(job_id).to_dict()
