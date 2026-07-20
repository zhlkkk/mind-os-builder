from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

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
        {"job_id": "lint", "inputs": {}},
        False,
    )

    assert scan.metrics["trigger_count"] == 1
    assert job.status.value == "succeeded"


def test_dispatcher_reports_invalid_parameters_without_traceback(tmp_path: Path) -> None:
    result = dispatch_action("collect.rss", tmp_path, {}, False)

    assert result.status.value == "blocked"
    assert result.reason_code == "config_error"


@pytest.mark.parametrize("raw_providers", ["", ",,", []])
def test_dispatcher_rejects_empty_providers_before_provider_execution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    raw_providers: str | list[object],
) -> None:
    provider_calls: list[object] = []

    class RecordingProvider:
        name = "tavily-search"

        def run(self, request: object) -> None:
            provider_calls.append(request)
            raise RuntimeError("Provider 不应执行")

    monkeypatch.setattr(
        "mind_os_builder.application.dispatcher.build_research_providers",
        lambda _settings: [RecordingProvider()],
    )

    result = dispatch_action(
        "research.run",
        tmp_path,
        {"topic": "MCP", "providers": raw_providers},
        False,
    )

    assert result.status.value == "blocked"
    assert result.reason_code == "config_error"
    assert provider_calls == []


def test_dispatcher_accepts_explicit_research_config_outside_vault(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    vault = tmp_path / "vault"
    config = tmp_path / "external-config.yaml"
    config.write_text("version: 1\nresearch: {}\n", encoding="utf-8")
    monkeypatch.setattr(
        "mind_os_builder.application.dispatcher.build_research_providers",
        lambda _settings: [],
    )

    result = dispatch_action(
        "research.run",
        vault,
        {"topic": "MCP", "providers": "auto", "config": str(config)},
        False,
    )

    assert result.status.value == "failed"
    assert result.reason_code == "providers_unavailable"


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


def test_distill_apply_replays_the_same_response_as_noop(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)
    journal = vault / "journals/2026-07-20.md"
    journal.write_text("今天需要沉淀这个判断。 #vector\n", encoding="utf-8")
    scan = dispatch_action(
        "distill.scan", vault, {"source": "journals/2026-07-20.md"}, False
    )
    trigger = scan.metrics["triggers"][0]
    parameters = {
        "source": "journals/2026-07-20.md",
        "baseline_hash": scan.metrics["baseline_hash"],
        "responses": [
            {
                "trigger_id": trigger["trigger_id"],
                "persona": "vector",
                "callout": "> [!quote] 🔨 Vector (10:20)\n> - [ ] 完成动作。",
            }
        ],
    }

    first = dispatch_action("distill.apply", vault, parameters, True)
    first_content = journal.read_text(encoding="utf-8")
    second = dispatch_action("distill.apply", vault, parameters, True)

    assert first.status.value == "succeeded"
    assert first.changed is True
    assert second.status.value == "succeeded"
    assert second.reason_code == "noop"
    assert second.changed is False
    assert journal.read_text(encoding="utf-8") == first_content
    assert first_content.count("mindos:distill:") == 1


def test_distill_apply_keeps_a_real_concurrent_change_as_conflict(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)
    journal = vault / "journals/2026-07-20.md"
    journal.write_text("今天需要沉淀这个判断。 #vector\n", encoding="utf-8")
    scan = dispatch_action(
        "distill.scan", vault, {"source": "journals/2026-07-20.md"}, False
    )
    trigger = scan.metrics["triggers"][0]
    journal.write_text(journal.read_text(encoding="utf-8") + "\n并发新增的人类内容。\n", encoding="utf-8")

    result = dispatch_action(
        "distill.apply",
        vault,
        {
            "source": "journals/2026-07-20.md",
            "baseline_hash": scan.metrics["baseline_hash"],
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
    assert "mindos:distill:" not in journal.read_text(encoding="utf-8")


def test_dispatcher_ingests_and_queries_a_wiki_page(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)
    content = """---
domain: agents
sources: 1
created: 2026-07-20
updated: 2026-07-20
tags: [agents]
---
# Agent Harness

确定性核心由适配器复用。
"""

    preview = dispatch_action(
        "wiki.ingest",
        vault,
        {"path": "wiki/concepts/agent-harness.md", "content": content},
        False,
    )
    assert not (vault / "wiki/concepts/agent-harness.md").exists()
    applied = dispatch_action(
        "wiki.ingest",
        vault,
        {"path": "wiki/concepts/agent-harness.md", "content": content},
        True,
    )
    query = dispatch_action("wiki.query", vault, {"query": "确定性核心"}, False)

    assert preview.reason_code == "dry_run"
    assert applied.status.value == "succeeded"
    assert "[[agent-harness]]" in (vault / "wiki/index.md").read_text(encoding="utf-8")
    assert "[[agent-harness]]" in (vault / "wiki/log.md").read_text(encoding="utf-8")
    assert query.status.value == "succeeded"
    assert query.metrics["matches"][0]["path"] == "wiki/concepts/agent-harness.md"


def test_wiki_ingest_requires_the_hash_when_updating(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)
    path = "wiki/concepts/welcome.md"
    target = vault / path
    original = target.read_text(encoding="utf-8")
    updated = original.replace("欢迎使用 Mind OS", "欢迎使用可移植 Mind OS")

    conflict = dispatch_action(
        "wiki.ingest", vault, {"path": path, "content": updated}, True
    )
    applied = dispatch_action(
        "wiki.ingest",
        vault,
        {
            "path": path,
            "content": updated,
            "expected_hash": hashlib.sha256(original.encode()).hexdigest(),
        },
        True,
    )
    replay = dispatch_action(
        "wiki.ingest", vault, {"path": path, "content": updated}, True
    )

    assert conflict.reason_code == "conflict"
    assert applied.status.value == "succeeded"
    assert replay.reason_code == "noop"
    assert target.read_text(encoding="utf-8") == updated


def test_wiki_ingest_rejects_human_only_and_history_paths(tmp_path: Path) -> None:
    vault = _initialized_vault(tmp_path)

    for path in ("wiki/insights/private.md", "raw/logseq-import/history.md"):
        result = dispatch_action(
            "wiki.ingest",
            vault,
            {"path": path, "content": "---\ndomain: x\n---\n"},
            True,
        )
        assert result.status.value == "blocked"
        assert not (vault / path).exists()
