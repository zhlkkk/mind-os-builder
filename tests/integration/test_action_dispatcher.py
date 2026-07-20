from __future__ import annotations

import json
from pathlib import Path

from mind_os_builder.application.dispatcher import dispatch_action


def _initialized_vault(tmp_path: Path) -> Path:
    vault = tmp_path / "vault"
    result = dispatch_action("wiki.init", vault, {}, True)
    assert result.status.value == "succeeded"
    return vault


def test_dispatcher_runs_books_and_lint_through_shared_actions(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)

    books = dispatch_action("books.init", vault, {}, True)
    lint = dispatch_action("wiki.lint", vault, {}, False)

    assert books.changed is True
    assert lint.status.value == "succeeded"


def test_dispatcher_collects_twitter_fixture_without_network(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)
    fixture = tmp_path / "twitter.json"
    fixture.write_text(
        json.dumps(
            {
                "records": [
                    {
                        "id": "post-1",
                        "title": "Agent CLI",
                        "text": "包含基准测试与源码。",
                        "url": "https://example.invalid/post-1",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )

    result = dispatch_action(
        "collect.twitter",
        vault,
        {"provider": "fixture", "fixture_path": str(fixture), "output": "raw/twitter/test.md"},
        True,
    )

    assert result.status.value == "succeeded"
    assert result.changed is True
    assert (vault / "raw/twitter/test.md").is_file()


def test_dispatcher_scans_distill_and_runs_declared_job(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(exist_ok=True)
    journal.write_text("今天需要沉淀这个判断。 #vector\n", encoding="utf-8")

    scan = dispatch_action(
        "distill.scan", vault, {"source": "journals/2026-07-20.md"}, False
    )
    job = dispatch_action(
        "job.run",
        vault,
        {"job_id": "lint", "inputs": {"root": "."}},
        False,
    )

    assert scan.metrics["trigger_count"] == 1
    assert job.status.value == "succeeded"


def test_dispatcher_reports_invalid_parameters_without_traceback(tmp_path: Path) -> None:
    result = dispatch_action("collect.rss", tmp_path, {}, False)

    assert result.status.value == "blocked"
    assert result.reason_code == "config_error"


def test_distill_apply_requires_the_scanned_baseline(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)
    journal = vault / "journals/2026-07-20.md"
    journal.write_text("今天需要沉淀这个判断。 #vector\n", encoding="utf-8")
    scan = dispatch_action(
        "distill.scan", vault, {"source": "journals/2026-07-20.md"}, False
    )
    trigger = scan.metrics["triggers"][0]

    result = dispatch_action(
        "distill.apply",
        vault,
        {
            "source": "journals/2026-07-20.md",
            "baseline_hash": "stale-baseline",
            "responses": [
                {
                    "trigger_id": trigger["trigger_id"],
                    "persona": "vector",
                    "callout": "> [!quote] 🔨 Vector (10:20)\n> - [ ] 完成动作。",
                }
            ],
        },
        True,
    )

    assert result.status.value == "blocked"
    assert result.reason_code == "conflict"
