from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Sequence

from mind_os_builder.application.commands import doctor_command, init_command, lint_command
from mind_os_builder.core.results import RunEnvelope


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
    wiki = commands.add_parser("wiki").add_subparsers(dest="wiki_command", required=True)
    init_parser = wiki.add_parser("init")
    init_parser.add_argument("root", type=Path)
    init_parser.add_argument("--apply", action="store_true")
    init_parser.add_argument("--json", action="store_true")
    lint_parser = wiki.add_parser("lint")
    lint_parser.add_argument("root", type=Path)
    lint_parser.add_argument("--json", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "doctor":
        return _emit(doctor_command(), args.json)
    if args.wiki_command == "init":
        return _emit(init_command(args.root, apply=args.apply), args.json)
    return _emit(lint_command(args.root), args.json)


if __name__ == "__main__":
    raise SystemExit(main())
