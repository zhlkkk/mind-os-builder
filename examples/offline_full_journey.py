from __future__ import annotations

import argparse
from importlib.resources import as_file
import json
from pathlib import Path
from typing import Sequence

from mind_os_builder.application.commands import lint_command
from mind_os_builder.books.init import initialize_books
from mind_os_builder.collect.filters.rules import FilterConfig
from mind_os_builder.collect.pipeline import CollectPipeline
from mind_os_builder.collect.providers.rss_feed import RssFeedProvider
from mind_os_builder.collect.providers.twitter_fixture import TwitterFixtureProvider
from mind_os_builder.core.resources import resource_tree
from mind_os_builder.distill.apply import apply_responses
from mind_os_builder.distill.dispatch import dispatch_waves
from mind_os_builder.distill.models import Persona, RoleOutput
from mind_os_builder.distill.scanner import scan_journal
from mind_os_builder.jobs.catalog import JobCatalog
from mind_os_builder.jobs.runner import CommandRegistry, JobRunner
from mind_os_builder.radar.review import radar_command
from mind_os_builder.research.models import (
    ProviderResult,
    ProviderStatus,
    ResearchMode,
    ResearchRequest,
)
from mind_os_builder.research.runner import ResearchRunner
from mind_os_builder.wiki.init import initialize_vault


RSS_FIXTURE = b"""<?xml version="1.0"?>
<rss version="2.0"><channel><title>Synthetic feed</title>
  <item><guid>rss-demo-1</guid><title>RSS/Atom provider contract</title>
    <description>Includes a local fixture and repeatable checks.</description>
    <link>https://example.invalid/rss/demo-1</link>
    <pubDate>Sun, 19 Jul 2026 08:00:00 GMT</pubDate></item>
</channel></rss>"""


class OfflineResearchProvider:
    name = "tavily-search"

    def run(self, request: ResearchRequest) -> ProviderResult:
        return ProviderResult(
            self.name,
            ProviderStatus.SUCCEEDED,
            f"{request.topic} 的合成证据，仅用于验证离线流程。",
            citations=["https://example.invalid/research/evidence"],
        )


CALLOUTS = {
    Persona.LUMINA: "> [!quote] 🌿 Lumina (10:20)\n> 我注意到这段感受值得被看见。",
    Persona.PRISM: "> [!quote] 🌌 Prism (10:21)\n> **What if** 换一个框架观察？",
    Persona.VECTOR: "> [!quote] 🔨 Vector (10:22)\n> - [ ] 完成一个可验证动作。",
    Persona.NEXUS: "> [!info] 🌐 Nexus (10:23)\n> 合成资料显示需要继续核查证据。",
    Persona.EMBER: "> [!quote] 🔥 Ember (10:24)\n> 这段触动与全书主题形成连接。",
}


def _distill(vault: Path) -> tuple[str, list[str]]:
    journal = vault / "journals/2026-07-20.md"
    journal.write_text(
        "今天需要先看见自己的感受。 #lumina\n\n"
        "也许可以反过来理解这个问题。 #prism\n\n"
        "下一步要把想法变成行动。 #vector\n\n"
        "这个技术判断需要更多证据。 #nexus\n\n"
        "这段阅读让我产生了连接。 #ember\n",
        encoding="utf-8",
    )
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    waves = dispatch_waves(plan)
    triggers = [trigger for wave in waves for trigger in wave]
    outputs = [
        RoleOutput(trigger.trigger_id, trigger.persona, CALLOUTS[trigger.persona])
        for trigger in triggers
    ]
    result = apply_responses(vault, plan, outputs, apply=True)
    roles = [trigger.persona.value for trigger in plan.triggers]
    return ("succeeded" if result.changed else "failed"), roles


def _radar(vault: Path) -> str:
    page = vault / "wiki/concepts/synthetic-radar.md"
    page.write_text(
        "---\n"
        "domain: ai-and-llm\n"
        "sources: 1\n"
        "created: 2026-06-01\n"
        "updated: 2026-06-01\n"
        "tags: [tech-radar]\n"
        "---\n"
        "# 合成技术雷达\n\n"
        "### 🔴 强信号\n\n"
        "**离线 Agent 协议**\n"
        "- 最新信号: 2026-06-01\n"
        "- 来源: 06-01 合成资料\n",
        encoding="utf-8",
    )
    index = vault / "wiki/index.md"
    index.write_text(
        index.read_text(encoding="utf-8").rstrip()
        + "\n- [[synthetic-radar]] — 合成技术雷达\n",
        encoding="utf-8",
    )
    log = vault / "wiki/log.md"
    log.write_text(
        log.read_text(encoding="utf-8").rstrip()
        + "\n- [example] 新增 [[synthetic-radar]] 合成页面\n",
        encoding="utf-8",
    )
    result = radar_command(
        {
            "root": str(vault),
            "pages": ["wiki/concepts/synthetic-radar.md"],
            "today": "2026-07-20",
            "apply": False,
        }
    )
    return result.status.value


def run(vault: Path) -> dict[str, object]:
    steps: dict[str, str] = {}
    steps["wiki"] = initialize_vault(vault, apply=True).status.value
    steps["lint"] = lint_command(vault).status.value

    catalog = JobCatalog.packaged()
    jobs = JobRunner(catalog, CommandRegistry({"wiki.lint": lambda inputs: lint_command(Path(str(inputs["root"]))) }))
    try:
        steps["job"] = jobs.run("lint", {"root": str(vault)}).status.value
    finally:
        jobs.close()

    fixture = resource_tree("data").joinpath("collect/fixtures/twitter.json")
    with as_file(fixture) as fixture_path:
        twitter = CollectPipeline(
            vault,
            TwitterFixtureProvider(fixture_path),
            FilterConfig(exclude_any=("收益故事",)),
        ).run(output="raw/collect/twitter-brief.md", apply=True)
    steps["twitter"] = twitter.envelope.status.value

    rss_provider = RssFeedProvider(
        ("https://example.invalid/offline.xml",),
        fetcher=lambda _url, _timeout: RSS_FIXTURE,
    )
    rss = CollectPipeline(vault, rss_provider, FilterConfig()).run(
        output="raw/collect/rss-brief.md",
        apply=True,
    )
    steps["rss"] = rss.envelope.status.value
    steps["books"] = initialize_books(vault, apply=True).status.value
    steps["distill"], roles = _distill(vault)

    research = ResearchRunner([OfflineResearchProvider()]).run(
        ResearchRequest("Agent 协议", ResearchMode.QUICK),
        vault_root=vault,
        apply=True,
    )
    steps["research"] = research.status.value
    steps["radar"] = _radar(vault)
    steps["final_lint"] = lint_command(vault).status.value
    status = "succeeded" if all(value == "succeeded" for value in steps.values()) else "failed"
    return {
        "status": status,
        "steps": steps,
        "distill_roles": roles,
        "jobs_available": list(catalog.list_ids()),
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="运行不需要网络或凭证的 Mind OS 完整旅程")
    parser.add_argument("--vault", type=Path, required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    summary = run(args.vault)
    if args.json:
        print(json.dumps(summary, ensure_ascii=False))
    else:
        for name, status in summary["steps"].items():
            print(f"{name}: {status}")
    return 0 if summary["status"] == "succeeded" else 1


if __name__ == "__main__":
    raise SystemExit(main())
