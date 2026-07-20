from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Mapping, Sequence

from mind_os_builder.application.commands import lint_command
from mind_os_builder.core.results import RunEnvelope
from mind_os_builder.jobs.catalog import JobCatalog
from mind_os_builder.jobs.runner import CommandRegistry, JobRunner


def _lint(inputs: Mapping[str, object]) -> RunEnvelope:
    return lint_command(Path(str(inputs["root"])))


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="用可替换参考运行层执行声明式 lint Job")
    parser.add_argument("--vault", type=Path, required=True)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)

    runner = JobRunner(JobCatalog.packaged(), CommandRegistry({"wiki.lint": _lint}))
    try:
        result = runner.run("lint", {"root": str(args.vault)})
    finally:
        runner.close()
    if args.json:
        print(json.dumps(result.to_dict(), ensure_ascii=False))
    else:
        print(f"lint: {result.status.value}")
    return result.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
