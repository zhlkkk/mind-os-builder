from __future__ import annotations

from pathlib import Path

from mind_os_builder.core.resources import resource_files, resource_tree
from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.write_guard import PathViolation, WriteGuard


TASK = "books.init"
INDEX_RELATIVE = Path("wiki/index.md")
LOG_RELATIVE = Path("wiki/log.md")
INDEX_ENTRY = "- [[example-book]] — Book Base 与 RIA 示例"
LOG_ENTRY = "- 安装 Book Base 与 RIA 示例。"


def _assets() -> dict[Path, str]:
    root = resource_tree("data").joinpath("books")
    return {
        relative: resource.read_text(encoding="utf-8")
        for relative, resource in resource_files(root)
    }


def initialize_books(vault_root: Path, *, apply: bool = False) -> RunEnvelope:
    """将 Book Base 资产安装到已初始化的 vault。

    已存在的同名文件永不覆盖；内容不同时返回告警，由用户自行合并。
    """
    vault_root = vault_root.expanduser()
    if not (vault_root / "wiki").is_dir():
        return RunEnvelope.blocked(TASK, "config_error", "vault 尚未完成核心 Wiki 初始化")

    assets = _assets()
    missing: dict[Path, str] = {}
    warnings: list[str] = []
    for relative, content in assets.items():
        target = vault_root / relative
        if not target.exists():
            missing[relative] = content
        elif not target.is_file() or target.read_text(encoding="utf-8") != content:
            warnings.append(f"保留用户现有文件：{relative.as_posix()}")

    index = (vault_root / INDEX_RELATIVE).read_text(encoding="utf-8")
    log = (vault_root / LOG_RELATIVE).read_text(encoding="utf-8")
    index_changed = INDEX_ENTRY not in index
    log_changed = LOG_ENTRY not in log

    if not missing and not index_changed and not log_changed:
        result = RunEnvelope.noop(TASK)
        result.warnings = warnings
        return result

    artifacts = sorted(path.as_posix() for path in missing)
    if index_changed:
        artifacts.append(INDEX_RELATIVE.as_posix())
    if log_changed:
        artifacts.append(LOG_RELATIVE.as_posix())
    if not apply:
        return RunEnvelope(
            task=TASK,
            status=RunStatus.SUCCEEDED,
            reason_code="dry_run",
            changed=True,
            artifacts=artifacts,
            warnings=warnings,
            metrics={"files_planned": len(missing)},
        )

    guard = WriteGuard(vault_root)
    try:
        for relative, content in missing.items():
            guard.atomic_write(relative, content)
        if index_changed:
            guard.atomic_write(INDEX_RELATIVE, index.rstrip() + "\n\n## 书籍\n\n" + INDEX_ENTRY + "\n")
        if log_changed:
            guard.atomic_write(LOG_RELATIVE, log.rstrip() + "\n" + LOG_ENTRY + "\n")
    except (OSError, PathViolation) as exc:
        return RunEnvelope.blocked(TASK, "path_violation", str(exc))

    return RunEnvelope(
        task=TASK,
        status=RunStatus.SUCCEEDED,
        changed=True,
        artifacts=artifacts,
        warnings=warnings,
        metrics={"files_installed": len(missing)},
    )
