from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import asdict, replace
from pathlib import Path
from typing import Any, Mapping

from mind_os_builder.application.commands import doctor_command, init_command, lint_command
from mind_os_builder.books.init import initialize_books
from mind_os_builder.books.validate import validate_books_module
from mind_os_builder.collect.contracts import Provider
from mind_os_builder.collect.filters.rules import FilterConfig
from mind_os_builder.collect.pipeline import CollectPipeline
from mind_os_builder.collect.providers.rss_feed import RssFeedProvider
from mind_os_builder.collect.providers.twitter_fixture import TwitterFixtureProvider
from mind_os_builder.collect.providers.twitter_opencli import TwitterOpenCliProvider
from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.distill.apply import apply_responses
from mind_os_builder.distill.idempotency import marker_for
from mind_os_builder.distill.models import DistillConflict, InvalidRoleOutput, Persona, RoleOutput
from mind_os_builder.distill.scanner import scan_journal
from mind_os_builder.jobs.catalog import JobCatalog
from mind_os_builder.jobs.runner import CommandRegistry, JobRunner
from mind_os_builder.radar.review import radar_command
from mind_os_builder.research.models import ResearchMode, ResearchRequest
from mind_os_builder.research.providers.http_json import HttpJsonProvider
from mind_os_builder.research.runner import ResearchRunner
from mind_os_builder.wiki.actions import WikiConflict, ingest_page, query_wiki


def _filters(parameters: Mapping[str, Any]) -> FilterConfig:
    value = parameters.get("filters", {})
    if not isinstance(value, Mapping):
        raise ValueError("filters 必须是对象")
    weights = value.get("weights", {})
    if not isinstance(weights, Mapping):
        raise ValueError("filters.weights 必须是对象")
    return FilterConfig(
        include_any=tuple(str(item) for item in value.get("include_any", [])),
        exclude_any=tuple(str(item) for item in value.get("exclude_any", [])),
        weights={str(key): int(weight) for key, weight in weights.items()},
        minimum_score=int(value.get("minimum_score", 0)),
        output_limit=(
            int(value["output_limit"])
            if value.get("output_limit") is not None
            else None
        ),
    )


def _collect(
    action: str,
    vault_root: Path,
    parameters: Mapping[str, Any],
    apply: bool,
) -> RunEnvelope:
    provider: Provider
    if action == "collect.rss":
        feeds = parameters.get("feeds")
        if not isinstance(feeds, list) or not feeds:
            raise ValueError("collect.rss 需要非空 feeds")
        provider = RssFeedProvider(
            tuple(str(item) for item in feeds),
            timeout=float(parameters.get("timeout", 10.0)),
        )
        default_output = "raw/rss/rss-brief.md"
    else:
        provider_name = str(parameters.get("provider", "fixture"))
        if provider_name == "fixture":
            fixture = parameters.get("fixture_path")
            if not fixture:
                raise ValueError("fixture provider 需要 fixture_path")
            provider = TwitterFixtureProvider(Path(str(fixture)))
        elif provider_name == "opencli":
            provider = TwitterOpenCliProvider()
        else:
            raise ValueError(f"未知 Twitter provider：{provider_name}")
        default_output = "raw/twitter/twitter-brief.md"
    result = CollectPipeline(vault_root, provider, _filters(parameters)).run(
        output=str(parameters.get("output", default_output)),
        apply=apply,
    )
    return result.envelope


def _distill(
    action: str,
    vault_root: Path,
    parameters: Mapping[str, Any],
    apply: bool,
) -> RunEnvelope:
    source = Path(str(parameters["source"]))
    plan = scan_journal(vault_root, source)
    if action == "distill.scan":
        return RunEnvelope(
            task=action,
            status=RunStatus.SUCCEEDED,
            reason_code="noop" if not plan.triggers else None,
            metrics={
                "source": plan.source_path.as_posix(),
                "baseline_hash": plan.baseline_hash,
                "trigger_count": len(plan.triggers),
                "triggers": [
                    {
                        "trigger_id": trigger.trigger_id,
                        "persona": trigger.persona.value,
                        "paragraph": trigger.paragraph,
                        "concurrency_key": trigger.concurrency_key,
                        "book_slug": trigger.book_slug,
                        "mode": trigger.mode,
                    }
                    for trigger in plan.triggers
                ],
            },
        )
    raw_responses = parameters.get("responses", [])
    if not isinstance(raw_responses, list):
        raise ValueError("responses 必须是数组")
    responses = [
        RoleOutput(
            trigger_id=str(item["trigger_id"]),
            persona=Persona(str(item["persona"])),
            callout=str(item["callout"]),
        )
        for item in raw_responses
        if isinstance(item, Mapping)
    ]
    expected_baseline = str(parameters["baseline_hash"])
    if expected_baseline != plan.baseline_hash:
        if apply and _responses_already_applied(
            root=vault_root, source=plan.source_path, responses=responses
        ):
            trigger_ids = [response.trigger_id for response in responses]
            return RunEnvelope(
                task=action,
                status=RunStatus.SUCCEEDED,
                reason_code="noop",
                metrics={
                    "dry_run": False,
                    "planned_trigger_ids": trigger_ids,
                    "applied_trigger_ids": [],
                    "skipped_trigger_ids": trigger_ids,
                },
            )
        if not apply:
            raise DistillConflict(f"journal baseline changed: {plan.source_path}")
        plan = replace(plan, baseline_hash=expected_baseline)
    result = apply_responses(vault_root, plan, responses, apply=apply)
    return RunEnvelope(
        task=action,
        status=RunStatus.SUCCEEDED,
        reason_code="noop" if not result.changed else ("dry_run" if result.dry_run else None),
        changed=result.changed,
        artifacts=[path.as_posix() for path in result.artifacts],
        warnings=list(result.warnings),
        metrics={
            "dry_run": result.dry_run,
            "planned_trigger_ids": list(result.planned_trigger_ids),
            "applied_trigger_ids": list(result.applied_trigger_ids),
            "skipped_trigger_ids": list(result.skipped_trigger_ids),
        },
    )


def _responses_already_applied(
    *, root: Path, source: Path, responses: list[RoleOutput]
) -> bool:
    if not responses:
        return False
    content = (root / source).read_text(encoding="utf-8")
    lines = content.splitlines()
    for response in responses:
        marker = marker_for(response.trigger_id)
        marker_indexes = [index for index, line in enumerate(lines) if line.lstrip() == marker]
        expected = response.callout.strip().splitlines()
        if not any(
            index >= len(expected)
            and [line.lstrip() for line in lines[index - len(expected) : index]] == expected
            for index in marker_indexes
        ):
            return False
    return True


def _research(
    vault_root: Path,
    parameters: Mapping[str, Any],
    apply: bool,
) -> RunEnvelope:
    trusted_endpoint = os.getenv("MINDOS_RESEARCH_ENDPOINT", "")
    endpoint = str(parameters.get("endpoint") or trusted_endpoint)
    if not endpoint:
        raise ValueError("research.run 需要 endpoint 或 MINDOS_RESEARCH_ENDPOINT")
    provider = HttpJsonProvider(
        endpoint=endpoint,
        trusted_endpoint=trusted_endpoint or None,
    )
    request = ResearchRequest(
        topic=str(parameters["topic"]),
        mode=ResearchMode(str(parameters.get("mode", "standard"))),
        focus=str(parameters.get("focus", "")),
        requested_providers=tuple(str(item) for item in parameters.get("providers", [])),
    )
    return ResearchRunner([provider]).run(request, vault_root=vault_root, apply=apply)


def _run_job(
    vault_root: Path,
    parameters: Mapping[str, Any],
    apply: bool,
) -> RunEnvelope:
    job_id = str(parameters["job_id"])
    raw_inputs = parameters.get("inputs", {})
    if not isinstance(raw_inputs, Mapping):
        raise ValueError("job inputs 必须是对象")

    def service(action: str) -> Callable[[Mapping[str, Any]], RunEnvelope]:
        def invoke(inputs: Mapping[str, Any]) -> RunEnvelope:
            nested = {key: value for key, value in inputs.items() if key not in {"root", "apply"}}
            return dispatch_action(action, vault_root, nested, bool(inputs.get("apply", False)))

        return invoke

    catalog = JobCatalog.packaged()
    actions = (catalog.get(item).action for item in catalog.list_ids())
    registry = CommandRegistry({action: service(action) for action in actions})
    runner = JobRunner(catalog, registry, fixed_inputs={"root": str(vault_root)})
    try:
        return runner.run(job_id, dict(raw_inputs), apply=apply)
    finally:
        runner.close()


def dispatch_action(
    action: str,
    vault_root: Path,
    parameters: Mapping[str, Any],
    apply: bool,
) -> RunEnvelope:
    """将所有适配器输入收敛到同一应用服务入口。"""

    root = vault_root.expanduser().resolve()
    try:
        if action == "doctor":
            return doctor_command()
        if action == "wiki.init":
            return init_command(root, apply=apply)
        if action == "wiki.lint":
            return lint_command(root)
        if action == "wiki.ingest":
            return ingest_page(
                root,
                str(parameters["path"]),
                str(parameters["content"]),
                expected_hash=(
                    str(parameters["expected_hash"])
                    if parameters.get("expected_hash") is not None
                    else None
                ),
                apply=apply,
            )
        if action == "wiki.query":
            return query_wiki(
                root,
                str(parameters["query"]),
                limit=int(parameters.get("limit", 10)),
            )
        if action == "books.init":
            return initialize_books(root, apply=apply)
        if action == "books.validate":
            issues = validate_books_module(root)
            return RunEnvelope(
                task=action,
                status=RunStatus.SUCCEEDED if not issues else RunStatus.BLOCKED,
                reason_code=None if not issues else "validation_error",
                errors=[asdict(issue) for issue in issues],
                metrics={"issue_count": len(issues)},
            )
        if action in {"collect.twitter", "collect.rss"}:
            return _collect(action, root, parameters, apply)
        if action in {"distill.scan", "distill.apply"}:
            return _distill(action, root, parameters, apply)
        if action == "research.run":
            return _research(root, parameters, apply)
        if action == "radar.review":
            return radar_command({**parameters, "root": str(root), "apply": apply})
        if action == "job.run":
            return _run_job(root, parameters, apply)
        return RunEnvelope.blocked(action, "config_error", f"未知 Action：{action}")
    except DistillConflict:
        return RunEnvelope.blocked(action, "conflict", "日记在 scan 后发生变化，请重新扫描")
    except WikiConflict:
        return RunEnvelope.blocked(action, "conflict", "Wiki 页面在候选生成后发生变化，请重新读取")
    except InvalidRoleOutput:
        return RunEnvelope.blocked(action, "validation_error", "角色输出不符合 Distill 契约")
    except (KeyError, TypeError, ValueError, OSError):
        return RunEnvelope.blocked(action, "config_error", "参数缺失、格式错误或本地资源不可用")
