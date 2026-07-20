from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
from pathlib import Path

from mind_os_builder.core.locks import FileLock
from mind_os_builder.core.resources import resource_files, resource_tree
from mind_os_builder.core.results import RunEnvelope, RunStatus


DIRECTORIES = (
    "raw/assets",
    "raw/logseq-import",
    "wiki/concepts",
    "wiki/entities",
    "wiki/connections",
    "wiki/insights",
    "journals",
    "templates",
)


def _asset_files() -> dict[str, bytes]:
    root = resource_tree("data").joinpath("core")
    return {
        relative.as_posix(): resource.read_bytes()
        for relative, resource in resource_files(root)
    }


def _matches(target: Path, assets: dict[str, bytes]) -> bool:
    if not target.is_dir():
        return False
    for relative, content in assets.items():
        path = target / relative
        if not path.is_file() or path.read_bytes() != content:
            return False
    allowed = {Path(relative) for relative in assets}
    for path in target.rglob("*"):
        if path.is_file() and path.relative_to(target) not in allowed:
            return False
    return True


def initialize_vault(target: Path, *, apply: bool = False) -> RunEnvelope:
    target = target.expanduser()
    if target.is_symlink() or ".." in target.parts:
        return RunEnvelope.blocked("wiki.init", "path_violation", "unsafe target path")
    assets = _asset_files()
    if _matches(target, assets):
        return RunEnvelope.noop("wiki.init")
    if target.exists() and any(target.iterdir()):
        return RunEnvelope.blocked("wiki.init", "conflict", "target contains unknown content")
    artifacts = sorted([*DIRECTORIES, *assets])
    if not apply:
        return RunEnvelope(
            task="wiki.init",
            status=RunStatus.SUCCEEDED,
            reason_code="dry_run",
            changed=True,
            artifacts=artifacts,
            metrics={"files": len(assets)},
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    lock_name = hashlib.sha256(str(target.resolve()).encode()).hexdigest()[:16]
    lock_path = target.parent / f".mindos-init-{lock_name}.lock"
    with FileLock(lock_path):
        if _matches(target, assets):
            return RunEnvelope.noop("wiki.init")
        if target.exists() and any(target.iterdir()):
            return RunEnvelope.blocked("wiki.init", "conflict", "target changed during init")
        staging = Path(tempfile.mkdtemp(prefix="mindos-init-", dir=target.parent))
        try:
            for directory in DIRECTORIES:
                (staging / directory).mkdir(parents=True, exist_ok=True)
            for relative, content in assets.items():
                path = staging / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(content)
            if target.exists():
                for path in staging.rglob("*"):
                    destination = target / path.relative_to(staging)
                    if path.is_dir():
                        destination.mkdir(parents=True, exist_ok=True)
                    else:
                        os.replace(path, destination)
            else:
                os.replace(staging, target)
            return RunEnvelope(
                task="wiki.init",
                status=RunStatus.SUCCEEDED,
                changed=True,
                artifacts=artifacts,
                metrics={"files": len(assets)},
            )
        finally:
            if staging.exists():
                shutil.rmtree(staging)
            lock_path.unlink(missing_ok=True)
