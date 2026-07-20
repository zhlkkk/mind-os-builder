from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from mind_os_builder.application.commands import lint_command
from mind_os_builder.books.init import initialize_books
from mind_os_builder.collect.filters.rules import FilterConfig
from mind_os_builder.collect.pipeline import CollectPipeline
from mind_os_builder.collect.providers.rss_feed import RssFeedProvider
from mind_os_builder.collect.providers.twitter_opencli import TwitterOpenCliProvider
from mind_os_builder.research.models import ResearchMode, ResearchRequest
from mind_os_builder.research.config import load_research_settings
from mind_os_builder.research.factory import build_research_providers
from mind_os_builder.research.runner import ResearchRunner
from mind_os_builder.wiki.init import initialize_vault

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        os.environ.get("MINDOS_RUN_LIVE") != "1",
        reason="设置 MINDOS_RUN_LIVE=1 后才运行 macOS MVP 烟测",
    ),
]


def _required_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        pytest.fail(f"真实 MVP 烟测缺少环境变量：{name}")
    return value


def test_live_mvp_uses_only_a_temporary_vault_and_writes_a_redacted_summary(
    tmp_path: Path,
) -> None:
    vault = tmp_path / "mvp-vault"
    assert initialize_vault(vault, apply=True).status.value == "succeeded"
    assert lint_command(vault).status.value == "succeeded"

    twitter = CollectPipeline(
        vault,
        TwitterOpenCliProvider(),
        FilterConfig(output_limit=5),
    ).run(output="raw/collect/twitter-live.md", apply=True)
    assert twitter.envelope.status.value in {"succeeded", "partial"}

    rss = CollectPipeline(
        vault,
        RssFeedProvider((_required_environment("MINDOS_LIVE_RSS_URL"),)),
        FilterConfig(output_limit=5),
    ).run(output="raw/collect/rss-live.md", apply=True)
    assert rss.envelope.status.value in {"succeeded", "partial"}

    research = ResearchRunner(
        build_research_providers(load_research_settings(vault))
    ).run(
        ResearchRequest("Agent 协议烟测", ResearchMode.QUICK),
        vault_root=vault,
        apply=True,
    )
    assert research.status.value in {"succeeded", "partial"}
    assert initialize_books(vault, apply=True).status.value == "succeeded"

    summary = {
        "twitter": {
            "status": twitter.envelope.status.value,
            "fetched": int(twitter.report["stages"].get("fetched", 0)),
            "rendered": int(twitter.report["stages"].get("rendered", 0)),
        },
        "rss": {
            "status": rss.envelope.status.value,
            "fetched": int(rss.report["stages"].get("fetched", 0)),
            "rendered": int(rss.report["stages"].get("rendered", 0)),
        },
        "research": {
            "status": research.status.value,
            "providers_succeeded": int(research.metrics.get("providers_succeeded", 0)),
            "providers_failed": int(research.metrics.get("providers_failed", 0)),
        },
        "books": "succeeded",
    }
    report = tmp_path / "mvp-smoke-summary.json"
    report.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    text = report.read_text(encoding="utf-8")
    assert str(Path.home()) not in text
    assert "token" not in text.casefold()
    assert "authorization" not in text.casefold()
