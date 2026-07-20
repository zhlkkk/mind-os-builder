from __future__ import annotations

import json
import subprocess

import pytest

from mind_os_builder.collect.contracts import ProviderError
from mind_os_builder.collect.filters.rules import FilterConfig
from mind_os_builder.collect.pipeline import CollectPipeline
from mind_os_builder.collect.providers.folo_cli import FoloCliProvider
from mind_os_builder.collect.providers.twitter_fixture import TwitterFixtureProvider
from mind_os_builder.collect.providers.twitter_opencli import TwitterOpenCliProvider


def test_twitter_fixture_loads_synthetic_records_without_network(tmp_path) -> None:
    fixture = tmp_path / "twitter.json"
    fixture.write_text(
        json.dumps(
            {
                "records": [
                    {
                        "id": "post-101",
                        "title": "Agent runtime release",
                        "text": "Includes code, measurements, and migration notes.",
                        "url": "https://example.invalid/twitter/101",
                    }
                ],
                "next_cursor": "post-101",
            }
        )
    )

    provider = TwitterFixtureProvider(fixture)
    batch = provider.fetch()

    assert batch.records[0]["id"] == "post-101"
    assert batch.next_cursor == "post-101"
    assert provider.capability.network is False


@pytest.mark.parametrize(
    ("runner", "expected_code"),
    [
        (lambda _command, _timeout: (_ for _ in ()).throw(FileNotFoundError()), "unavailable"),
        (
            lambda command, timeout: (_ for _ in ()).throw(
                subprocess.TimeoutExpired(command, timeout)
            ),
            "timeout",
        ),
        (
            lambda _command, _timeout: subprocess.CompletedProcess(
                [], 1, stdout="", stderr="401 synthetic-credential-marker"
            ),
            "authentication",
        ),
        (
            lambda _command, _timeout: subprocess.CompletedProcess(
                [], 1, stdout="", stderr="429 rate limit"
            ),
            "rate_limited",
        ),
        (
            lambda _command, _timeout: subprocess.CompletedProcess(
                [], 0, stdout="not-json", stderr=""
            ),
            "invalid_json",
        ),
    ],
)
def test_opencli_returns_sanitized_provider_errors(runner, expected_code) -> None:
    provider = TwitterOpenCliProvider(runner=runner)

    with pytest.raises(ProviderError) as caught:
        provider.fetch()

    assert caught.value.code == expected_code
    assert "synthetic-credential-marker" not in str(caught.value)


def test_folo_cli_is_an_experimental_adapter_with_the_same_contract() -> None:
    def runner(_command, _timeout):
        return subprocess.CompletedProcess(
            [],
            0,
            stdout=json.dumps(
                {"entries": [{"id": "entry-1", "title": "Local feed entry"}], "cursor": "2"}
            ),
            stderr="",
        )

    provider = FoloCliProvider(runner=runner)
    batch = provider.fetch()

    assert batch.records[0]["id"] == "entry-1"
    assert batch.next_cursor == "2"
    assert provider.capability.experimental is True


def _write_pipeline_fixture(tmp_path, records):
    fixture = tmp_path / "pipeline-twitter.json"
    fixture.write_text(json.dumps({"records": records, "next_cursor": "cursor-9"}))
    return TwitterFixtureProvider(fixture)


def test_pipeline_dry_run_is_auditable_and_writes_nothing_to_vault(tmp_path) -> None:
    provider = _write_pipeline_fixture(
        tmp_path,
        [
            {
                "id": "specific",
                "title": "Agent CLI release",
                "text": "Includes code and a benchmark.",
                "url": "https://example.invalid/twitter/specific",
            },
            {
                "id": "sales",
                "title": "Agent income story",
                "text": "No reproducible details.",
                "url": "https://example.invalid/twitter/sales",
            },
            {
                "id": "specific",
                "title": "Duplicate",
                "text": "Duplicate copy.",
                "url": "https://example.invalid/twitter/specific",
            },
        ],
    )
    pipeline = CollectPipeline(
        tmp_path / "vault",
        provider,
        FilterConfig(include_any=("agent",), exclude_any=("income",)),
    )

    result = pipeline.run(output="raw/collect/twitter-brief.md", apply=False)

    assert result.envelope.status.value == "succeeded"
    assert result.envelope.changed is False
    assert result.report["stages"] == {
        "fetched": 3,
        "normalized": 2,
        "filtered": 1,
        "reviewed": 1,
        "rendered": 1,
    }
    assert result.report["filter_reasons"] == {"sales": ["excluded:income"]}
    assert "signal-id:specific" in result.markdown
    assert not (tmp_path / "vault").exists()


def test_pipeline_apply_merges_existing_brief_and_then_commits_cursor(tmp_path) -> None:
    vault = tmp_path / "vault"
    output = vault / "raw/collect/twitter-brief.md"
    output.parent.mkdir(parents=True)
    output.write_text(
        "---\ndomain: collect\nsources: 1\ncreated: 2026-07-19\nupdated: 2026-07-19\n"
        "tags: [collect]\n---\n\n## Existing\n<!-- signal-id:old -->\n"
        "[Existing](https://example.invalid/twitter/old)\n"
    )
    provider = _write_pipeline_fixture(
        tmp_path,
        [
            {
                "id": "old",
                "title": "Already collected",
                "text": "Should not be duplicated.",
                "url": "https://example.invalid/twitter/old",
            },
            {
                "id": "new",
                "title": "New engineering signal",
                "text": "Includes a benchmark.",
                "url": "https://example.invalid/twitter/new",
            },
        ],
    )
    pipeline = CollectPipeline(vault, provider, FilterConfig())

    result = pipeline.run(output="raw/collect/twitter-brief.md", apply=True)

    content = output.read_text()
    assert result.envelope.status.value == "succeeded"
    assert result.envelope.changed is True
    assert content.count("signal-id:old") == 1
    assert content.count("signal-id:new") == 1
    assert pipeline.cursor_store.get(provider.name) == "cursor-9"


def test_pipeline_does_not_commit_cursor_when_validation_fails(tmp_path) -> None:
    vault = tmp_path / "vault"
    provider = _write_pipeline_fixture(
        tmp_path,
        [{"id": "broken", "title": "Missing source URL", "text": "Cannot be promoted."}],
    )
    pipeline = CollectPipeline(vault, provider, FilterConfig())

    result = pipeline.run(output="raw/collect/twitter-brief.md", apply=True)

    assert result.envelope.status.value == "failed"
    assert result.envelope.reason_code == "validation_failed"
    assert pipeline.cursor_store.get(provider.name) is None
    assert not (vault / "raw/collect/twitter-brief.md").exists()


def test_pipeline_does_not_commit_cursor_when_promotion_path_is_a_symlink(tmp_path) -> None:
    vault = tmp_path / "vault"
    outside = tmp_path / "outside"
    vault.mkdir()
    outside.mkdir()
    (vault / "raw").symlink_to(outside, target_is_directory=True)
    provider = _write_pipeline_fixture(
        tmp_path,
        [
            {
                "id": "safe-content",
                "title": "Valid signal",
                "text": "Valid body.",
                "url": "https://example.invalid/twitter/safe",
            }
        ],
    )
    pipeline = CollectPipeline(vault, provider, FilterConfig())

    result = pipeline.run(output="raw/collect/twitter-brief.md", apply=True)

    assert result.envelope.status.value == "failed"
    assert result.envelope.reason_code == "promotion_failed"
    assert pipeline.cursor_store.get(provider.name) is None
    assert not (outside / "collect/twitter-brief.md").exists()
