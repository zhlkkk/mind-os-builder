from __future__ import annotations

import json

import pytest

from mind_os_builder.cli.main import _emit, build_parser, main
from mind_os_builder.core.results import RunEnvelope, RunStatus


REQUIRED_KEYS = {
    "api_version",
    "run_id",
    "task",
    "status",
    "reason_code",
    "changed",
    "artifacts",
    "warnings",
    "errors",
    "metrics",
}


@pytest.mark.parametrize(
    ("envelope", "expected_status", "expected_reason"),
    [
        (RunEnvelope(task="demo", status=RunStatus.SUCCEEDED), "succeeded", None),
        (RunEnvelope.noop("demo"), "succeeded", "noop"),
        (RunEnvelope(task="demo", status=RunStatus.PARTIAL), "partial", None),
        (RunEnvelope.blocked("demo", "conflict", "文件基线已变化"), "blocked", "conflict"),
        (
            RunEnvelope.blocked("demo", "config_error", "配置无效"),
            "blocked",
            "config_error",
        ),
    ],
)
def test_cli_json_envelope_is_stable(
    capsys: pytest.CaptureFixture[str],
    envelope: RunEnvelope,
    expected_status: str,
    expected_reason: str | None,
) -> None:
    assert _emit(envelope, as_json=True) == envelope.exit_code
    payload = json.loads(capsys.readouterr().out)
    assert REQUIRED_KEYS <= payload.keys()
    assert payload["api_version"] == "v1"
    assert payload["status"] == expected_status
    assert payload["reason_code"] == expected_reason


def test_cli_exposes_books_and_job_catalog(tmp_path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["wiki", "init", str(tmp_path), "--apply", "--json"]) == 0
    capsys.readouterr()

    assert main(["books", "init", str(tmp_path), "--apply", "--json"]) == 0
    books = json.loads(capsys.readouterr().out)
    assert books["task"] == "books.init"

    assert main(["job", "list", "--json"]) == 0
    jobs = json.loads(capsys.readouterr().out)
    assert "collect-twitter" in jobs["jobs"]


def test_cli_exposes_wiki_ingest_and_query(tmp_path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["wiki", "init", str(tmp_path), "--apply", "--json"]) == 0
    capsys.readouterr()
    candidate = tmp_path.parent / "candidate.md"
    candidate.write_text(
        """---
domain: test
sources: 1
created: 2026-07-20
updated: 2026-07-20
tags: [test]
---
# CLI Contract

通过统一 Action 写入。
""",
        encoding="utf-8",
    )

    assert main(
        [
            "wiki",
            "ingest",
            str(tmp_path),
            "wiki/concepts/cli-contract.md",
            str(candidate),
            "--apply",
            "--json",
        ]
    ) == 0
    ingested = json.loads(capsys.readouterr().out)
    assert ingested["task"] == "wiki.ingest"

    assert main(["wiki", "query", str(tmp_path), "统一 Action", "--json"]) == 0
    queried = json.loads(capsys.readouterr().out)
    assert queried["task"] == "wiki.query"
    assert queried["metrics"]["match_count"] == 1


def test_cli_exposes_real_research_provider_configuration() -> None:
    args = build_parser().parse_args(
        [
            "research",
            "run",
            "/tmp/vault",
            "MCP",
            "--providers",
            "tavily,exa,grok",
            "--config",
            "/tmp/research.yaml",
            "--timeout",
            "45",
            "--tavily-research-wait",
            "120",
            "--tavily-poll-interval",
            "3",
        ]
    )

    assert args.providers == "tavily,exa,grok"
    assert str(args.config) == "/tmp/research.yaml"
    assert args.timeout == 45
    assert args.tavily_research_wait == 120
    assert args.tavily_poll_interval == 3
