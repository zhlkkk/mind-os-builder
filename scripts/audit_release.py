#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


PRIVATE_PATH = re.compile(r"/Users/(?!<)[^/\s]+/(?:private|Library/Mobile Documents)/")
SECRET = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{16,}|(?:API_KEY|TOKEN|SECRET)\s*=\s*['\"]?[A-Za-z0-9_./+-]{16,})"
)
EXCLUDED_PARTS = {".git", ".venv", ".pytest_cache", ".mypy_cache", ".ruff_cache", "dist", "build"}


@dataclass(frozen=True, slots=True)
class Finding:
    path: str
    kind: str


def audit_text(path: str, text: str) -> list[Finding]:
    findings: list[Finding] = []
    if PRIVATE_PATH.search(text):
        findings.append(Finding(path, "private_path"))
    if SECRET.search(text):
        findings.append(Finding(path, "secret"))
    return findings


def audit_paths(paths: Iterable[Path]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        if not path.is_file() or any(part in EXCLUDED_PARTS for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        findings.extend(audit_text(str(path), text))
    return findings


def repository_files(root: Path) -> list[Path]:
    return [path for path in root.rglob("*") if path.is_file() and not any(part in EXCLUDED_PARTS for part in path.relative_to(root).parts)]


def audit_git_history(root: Path) -> list[Finding]:
    if not (root / ".git").exists():
        return []
    listing = subprocess.run(
        ["git", "rev-list", "--objects", "--all"],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )
    findings: list[Finding] = []
    for line in listing.stdout.splitlines():
        object_id, _, name = line.partition(" ")
        if not name:
            continue
        content = subprocess.run(
            ["git", "cat-file", "-p", object_id],
            cwd=root,
            check=False,
            capture_output=True,
        ).stdout.decode("utf-8", errors="ignore")
        findings.extend(audit_text(f"git:{object_id}:{name}", content))
    return findings


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit public release inputs for private data.")
    parser.add_argument("root", nargs="?", type=Path, default=Path.cwd())
    args = parser.parse_args()
    root = args.root.resolve()
    findings = audit_paths(repository_files(root)) + audit_git_history(root)
    for finding in findings:
        print(f"{finding.kind}: {finding.path}")
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())
