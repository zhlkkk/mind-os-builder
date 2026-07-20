from __future__ import annotations

from importlib.resources import files
from pathlib import Path

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.write_guard import PathViolation, WriteGuard


TASK = "books.init"
ASSET_ROOT = "vault/books"


def _assets() -> dict[Path, str]:
    root = files("mind_os_builder.assets").joinpath(ASSET_ROOT)
    assets: dict[Path, str] = {}

    def visit(item: object, relative: Path) -> None:
        if item.is_file():  # type: ignore[attr-defined]
            assets[relative] = item.read_text(encoding="utf-8")  # type: ignore[attr-defined]
            return
        for child in item.iterdir():  # type: ignore[attr-defined]
            visit(child, relative / child.name)

    visit(root, Path())
    return assets


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

    if not missing:
        result = RunEnvelope.noop(TASK)
        result.warnings = warnings
        return result

    artifacts = sorted(path.as_posix() for path in missing)
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
