from pathlib import Path

import pytest

from mind_os_builder.core.capabilities import ACTION_REGISTRY
from mind_os_builder.jobs.catalog import JobCatalog, UnknownJobError
from mind_os_builder.jobs.models import JobDefinition, JobSchemaError


BASE_JOB = {
    "api_version": "mindos.dev/v1",
    "id": "wiki-lint",
    "action": "wiki.lint",
    "inputs": {"root": {"required": True}},
    "outputs": ["run-envelope"],
    "effects": ["read:vault"],
    "default_mode": "dry-run",
    "concurrency_key": "vault:{root}:wiki",
    "timeout_seconds": 60,
    "retry": {"attempts": 1},
    "success_statuses": ["succeeded"],
    "required_capabilities": ["wiki.read"],
    "required_secrets": [],
    "schedule_hint": "daily",
    "timezone": "local",
}


@pytest.mark.parametrize("missing", ["effects", "concurrency_key", "success_statuses"])
def test_job_schema_rejects_required_execution_contract(missing: str) -> None:
    payload = dict(BASE_JOB)
    payload.pop(missing)

    with pytest.raises(JobSchemaError, match=missing):
        JobDefinition.from_mapping(payload)


def test_catalog_reports_unknown_job_as_configuration_error(tmp_path: Path) -> None:
    catalog = JobCatalog({})

    with pytest.raises(UnknownJobError, match="missing-job") as error:
        catalog.get("missing-job")

    assert error.value.reason_code == "config_error"


def test_packaged_job_catalog_is_complete() -> None:
    catalog = JobCatalog.packaged()

    assert set(catalog.list_ids()) == {
        "collect-rss",
        "collect-twitter",
        "distill",
        "lint",
        "tech-radar",
        "tech-research",
    }
    assert catalog.get("tech-radar").schedule_hint == "twice-monthly"


def test_packaged_jobs_only_reference_public_actions() -> None:
    catalog = JobCatalog.packaged()

    for job_id in catalog.list_ids():
        assert catalog.get(job_id).action in ACTION_REGISTRY
