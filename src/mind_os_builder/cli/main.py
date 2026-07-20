from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Sequence

from mind_os_builder.core.results import RunEnvelope, RunStatus


def _emit(result: RunEnvelope, as_json: bool) -> int:
    if as_json:
        print(json.dumps(result.to_dict(), ensure_ascii=False))
    else:
        marker = "✓" if result.exit_code == 0 else "✗"
        print(f"{marker} {result.task}: {result.status.value}")
        for error in result.errors:
            print(f"  {error['code']}: {error['message']}")
    return result.exit_code


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mindos")
    commands = parser.add_subparsers(dest="command", required=True)
    doctor_parser = commands.add_parser("doctor")
    doctor_parser.add_argument("--json", action="store_true")
    doctor_parser.set_defaults(action="doctor")

    wiki = commands.add_parser("wiki").add_subparsers(dest="wiki_command", required=True)
    init_parser = wiki.add_parser("init")
    init_parser.add_argument("root", type=Path)
    init_parser.add_argument("--apply", action="store_true")
    init_parser.add_argument("--json", action="store_true")
    init_parser.set_defaults(action="wiki.init")
    lint_parser = wiki.add_parser("lint")
    lint_parser.add_argument("root", type=Path)
    lint_parser.add_argument("--json", action="store_true")
    lint_parser.set_defaults(action="wiki.lint", apply=False)

    books = commands.add_parser("books").add_subparsers(dest="books_command", required=True)
    books_init = books.add_parser("init")
    books_init.add_argument("root", type=Path)
    books_init.add_argument("--apply", action="store_true")
    books_init.add_argument("--json", action="store_true")
    books_init.set_defaults(action="books.init")
    books_validate = books.add_parser("validate")
    books_validate.add_argument("root", type=Path)
    books_validate.add_argument("--json", action="store_true")
    books_validate.set_defaults(action="books.validate", apply=False)

    collect = commands.add_parser("collect").add_subparsers(dest="collect_command", required=True)
    twitter = collect.add_parser("twitter")
    twitter.add_argument("root", type=Path)
    twitter_provider = twitter.add_mutually_exclusive_group(required=True)
    twitter_provider.add_argument("--fixture", type=Path)
    twitter_provider.add_argument("--opencli", action="store_true")
    twitter.add_argument("--output", default="raw/twitter/twitter-brief.md")
    twitter.add_argument("--apply", action="store_true")
    twitter.add_argument("--json", action="store_true")
    twitter.set_defaults(action="collect.twitter")
    rss = collect.add_parser("rss")
    rss.add_argument("root", type=Path)
    rss.add_argument("--feed", action="append", required=True)
    rss.add_argument("--output", default="raw/rss/rss-brief.md")
    rss.add_argument("--timeout", type=float, default=10.0)
    rss.add_argument("--apply", action="store_true")
    rss.add_argument("--json", action="store_true")
    rss.set_defaults(action="collect.rss")

    distill = commands.add_parser("distill").add_subparsers(dest="distill_command", required=True)
    scan = distill.add_parser("scan")
    scan.add_argument("root", type=Path)
    scan.add_argument("source")
    scan.add_argument("--json", action="store_true")
    scan.set_defaults(action="distill.scan", apply=False)
    distill_apply = distill.add_parser("apply")
    distill_apply.add_argument("root", type=Path)
    distill_apply.add_argument("source")
    distill_apply.add_argument("responses", type=Path)
    distill_apply.add_argument("--apply", action="store_true")
    distill_apply.add_argument("--json", action="store_true")
    distill_apply.set_defaults(action="distill.apply")

    research = commands.add_parser("research").add_subparsers(
        dest="research_command", required=True
    )
    research_run = research.add_parser("run")
    research_run.add_argument("root", type=Path)
    research_run.add_argument("topic")
    research_run.add_argument("--mode", choices=("quick", "standard", "deep"), default="standard")
    research_run.add_argument("--focus", default="")
    research_run.add_argument("--endpoint")
    research_run.add_argument("--apply", action="store_true")
    research_run.add_argument("--json", action="store_true")
    research_run.set_defaults(action="research.run")

    radar = commands.add_parser("radar").add_subparsers(dest="radar_command", required=True)
    radar_review = radar.add_parser("review")
    radar_review.add_argument("root", type=Path)
    radar_review.add_argument("--page", action="append", default=[])
    radar_review.add_argument("--hub")
    radar_review.add_argument("--today")
    radar_review.add_argument("--apply", action="store_true")
    radar_review.add_argument("--json", action="store_true")
    radar_review.set_defaults(action="radar.review")

    job = commands.add_parser("job").add_subparsers(dest="job_command", required=True)
    job_list = job.add_parser("list")
    job_list.add_argument("--json", action="store_true")
    job_describe = job.add_parser("describe")
    job_describe.add_argument("job_id")
    job_describe.add_argument("--json", action="store_true")
    job_run = job.add_parser("run")
    job_run.add_argument("job_id")
    job_run.add_argument("root", type=Path)
    job_run.add_argument("--inputs-json", default="{}")
    job_run.add_argument("--apply", action="store_true")
    job_run.add_argument("--json", action="store_true")
    job_run.set_defaults(action="job.run")

    mcp = commands.add_parser("mcp").add_subparsers(dest="mcp_command", required=True)
    mcp_serve = mcp.add_parser("serve")
    mcp_serve.add_argument("root", type=Path)
    return parser


def _parameters(args: argparse.Namespace) -> dict[str, Any]:
    action = args.action
    if action == "collect.twitter":
        return {
            "provider": "opencli" if args.opencli else "fixture",
            "fixture_path": str(args.fixture) if args.fixture else None,
            "output": args.output,
        }
    if action == "collect.rss":
        return {"feeds": args.feed, "output": args.output, "timeout": args.timeout}
    if action == "distill.scan":
        return {"source": args.source}
    if action == "distill.apply":
        payload = json.loads(args.responses.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("responses 文件必须包含 baseline_hash 与 responses")
        return {
            "source": args.source,
            "baseline_hash": payload["baseline_hash"],
            "responses": payload["responses"],
        }
    if action == "research.run":
        return {
            "topic": args.topic,
            "mode": args.mode,
            "focus": args.focus,
            "endpoint": args.endpoint,
        }
    if action == "radar.review":
        hub = args.hub or (None if args.page else "wiki/concepts/tech-radar.md")
        return {"pages": args.page, "hub": hub, "today": args.today}
    if action == "job.run":
        inputs = json.loads(args.inputs_json)
        if not isinstance(inputs, dict):
            raise ValueError("--inputs-json 必须是 JSON 对象")
        return {"job_id": args.job_id, "inputs": inputs}
    return {}


def _emit_catalog(args: argparse.Namespace) -> int:
    from mind_os_builder.jobs.catalog import JobCatalog

    catalog = JobCatalog.packaged()
    if args.job_command == "list":
        payload: dict[str, Any] = {"api_version": "v1", "jobs": list(catalog.list_ids())}
    else:
        payload = {"api_version": "v1", "job": catalog.describe(args.job_id)}
    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
    elif args.job_command == "list":
        print("\n".join(payload["jobs"]))
    else:
        print(json.dumps(payload["job"], ensure_ascii=False, indent=2))
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "job" and args.job_command in {"list", "describe"}:
        return _emit_catalog(args)
    if args.command == "mcp":
        from mind_os_builder.application.dispatcher import dispatch_action
        from mind_os_builder.jobs.catalog import JobCatalog
        from mind_os_builder.mcp.server import create_server

        catalog = JobCatalog.packaged()
        jobs = {job_id: catalog.describe(job_id) for job_id in catalog.list_ids()}
        server = create_server(vault_root=args.root, dispatcher=dispatch_action, jobs=jobs)
        server.run(transport="stdio")
        return 0
    root = getattr(args, "root", Path.cwd())
    apply = bool(getattr(args, "apply", False))
    as_json = bool(getattr(args, "json", False))
    try:
        parameters = _parameters(args)
    except (OSError, ValueError, json.JSONDecodeError):
        return _emit(
            RunEnvelope(
                task=getattr(args, "action", "cli"),
                status=RunStatus.BLOCKED,
                reason_code="config_error",
                errors=[{"code": "config_error", "message": "参数文件或 JSON 无效"}],
            ),
            as_json,
        )
    from mind_os_builder.application.dispatcher import dispatch_action

    return _emit(dispatch_action(args.action, root, parameters, apply), as_json)


if __name__ == "__main__":
    raise SystemExit(main())
