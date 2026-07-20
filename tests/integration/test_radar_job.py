from pathlib import Path
from typing import Any

from mind_os_builder.core.results import RunStatus
from mind_os_builder.jobs.catalog import JobCatalog
from mind_os_builder.jobs.runner import CommandRegistry, JobRunner
from mind_os_builder.radar.review import radar_command


def test_packaged_radar_job_matches_direct_command(tmp_path: Path) -> None:
    page = tmp_path / "wiki" / "radar.md"
    page.parent.mkdir(parents=True)
    page.write_text(
        "---\ndomain: ai\nsources: 1\ncreated: 2026-01-01\nupdated: 2026-01-01\ntags: [radar]\n---\n"
        "# Radar\n### 🟢 记录\n**旧信号**\n- 最新信号: 2026-01-01\n",
        encoding="utf-8",
    )
    inputs: dict[str, Any] = {
        "root": str(tmp_path),
        "pages": ["wiki/radar.md"],
        "today": "2026-01-15",
    }

    direct = radar_command(inputs)
    runner = JobRunner(JobCatalog.packaged(), CommandRegistry({"radar.review": radar_command}))
    via_job = runner.run("tech-radar", inputs)

    assert direct.status is RunStatus.SUCCEEDED
    assert via_job.status is RunStatus.SUCCEEDED
    assert via_job.metrics == direct.metrics
    assert page.read_text(encoding="utf-8").count("⬇️") == 0


def test_packaged_radar_job_returns_sanitized_path_violation(tmp_path: Path) -> None:
    secret_name = "private-radar-secret.md"
    inputs: dict[str, Any] = {
        "root": str(tmp_path),
        "pages": [f"../{secret_name}"],
        "today": "2026-01-15",
    }
    runner = JobRunner(
        JobCatalog.packaged(), CommandRegistry({"radar.review": radar_command})
    )

    result = runner.run("tech-radar", inputs)
    runner.close()

    assert result.status is RunStatus.BLOCKED
    assert result.reason_code == "path_violation"
    assert secret_name not in str(result.to_dict())
