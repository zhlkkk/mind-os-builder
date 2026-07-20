from __future__ import annotations

from pathlib import Path

from mind_os_builder.core.doctor import doctor
from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.wiki.init import initialize_vault
from mind_os_builder.wiki.lint import lint_vault


def doctor_command() -> RunEnvelope:
    report = doctor()
    required_ok = all(item["available"] for item in report["required"].values())
    return RunEnvelope(
        task="doctor",
        status=RunStatus.SUCCEEDED if required_ok else RunStatus.BLOCKED,
        reason_code=None if required_ok else "missing_requirement",
        metrics=report,
    )


def init_command(root: Path, *, apply: bool) -> RunEnvelope:
    return initialize_vault(root, apply=apply)


def lint_command(root: Path) -> RunEnvelope:
    report = lint_vault(root)
    return RunEnvelope(
        task="wiki.lint",
        status=RunStatus.SUCCEEDED if report.error_count == 0 else RunStatus.BLOCKED,
        reason_code=None if report.error_count == 0 else "lint_error",
        metrics=report.to_dict(),
    )
