#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Sequence


PROJECT_SKILL_PATHS = {
    "codex": Path(".agents/skills"),
    "claude-code": Path(".claude/skills"),
    "pi": Path(".pi/skills"),
    "openclaw": Path("skills"),
    "workbuddy": Path(".agents/skills"),
}

USER_SKILL_PATHS = {
    "codex": Path(".agents/skills"),
    "claude-code": Path(".claude/skills"),
    "pi": Path(".pi/agent/skills"),
    "hermes": Path(".hermes/skills"),
    "openclaw": Path(".openclaw/skills"),
    "workbuddy": Path(".workbuddy/skills"),
}


def resolve_destination(harness: str, scope: str, project: Path, home: Path) -> Path:
    """返回宿主实际扫描的 Skill 目录，不猜测未公开的兼容路径。"""

    if scope == "project":
        try:
            relative = PROJECT_SKILL_PATHS[harness]
        except KeyError as exc:
            if harness == "hermes":
                raise ValueError("Hermes 仅提供已确认的 user 级 Skill 安装路径") from exc
            raise ValueError(f"不支持的 Agent 宿主：{harness}") from exc
        return project.resolve() / relative
    if scope == "user":
        try:
            relative = USER_SKILL_PATHS[harness]
        except KeyError as exc:
            raise ValueError(f"不支持的 Agent 宿主：{harness}") from exc
        return home.resolve() / relative
    raise ValueError(f"不支持的安装范围：{scope}")


def _tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.rglob("*")):
        digest.update(path.relative_to(root).as_posix().encode("utf-8"))
        digest.update(b"\0")
        if path.is_dir():
            digest.update(b"directory")
        else:
            digest.update(b"file\0")
            digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def _symlink_in_tree(root: Path) -> Path | None:
    for path in (root, *root.rglob("*")):
        if path.is_symlink():
            return path
    return None


def _path_symlink(root: Path, target: Path) -> Path | None:
    relative = target.relative_to(root)
    current = root
    for part in relative.parts:
        current /= part
        if current.is_symlink():
            return current
        if not current.exists():
            break
    return None


def _skill_sources(repository: Path) -> list[Path]:
    root = repository.resolve() / ".agents/skills"
    if not root.is_dir():
        raise ValueError(f"找不到规范 Skill 目录：{root}")
    symlink = _path_symlink(repository.resolve(), root)
    if symlink is not None:
        raise ValueError(f"规范 Skill 路径包含符号链接：{symlink}")
    skills = sorted(path for path in root.iterdir() if (path / "SKILL.md").is_file())
    if not skills:
        raise ValueError(f"规范 Skill 目录为空：{root}")
    return skills


def _materialize_skills(repository: Path, sources: list[Path], destination: Path) -> list[Path]:
    materialized: list[Path] = []
    for source in sources:
        symlink = _symlink_in_tree(source)
        if symlink is not None:
            raise ValueError(f"Skill 源目录包含符号链接：{symlink}")
        target = destination / source.name
        shutil.copytree(source, target)
        materialized.append(target)

    distill = destination / "distill"
    if distill.is_dir():
        roles = repository / "agents/roles"
        if not roles.is_dir():
            raise ValueError(f"找不到规范角色目录：{roles}")
        symlink = _path_symlink(repository, roles)
        if symlink is not None:
            raise ValueError(f"规范角色路径包含符号链接：{symlink}")
        symlink = _symlink_in_tree(roles)
        if symlink is not None:
            raise ValueError(f"角色源目录包含符号链接：{symlink}")
        shutil.copytree(roles, distill / "references/roles")
    return materialized


def _blocked(report: dict[str, Any], message: str) -> dict[str, Any]:
    report["status"] = "blocked"
    report["message"] = message
    return report


def install_skills(
    repository: Path,
    harness: str,
    scope: str,
    project: Path,
    home: Path,
    *,
    apply: bool = False,
) -> dict[str, Any]:
    """预演或安装开放 Agent Skills；冲突时绝不覆盖已有目录。"""

    repository_root = repository.resolve()
    source_root = repository_root / ".agents/skills"
    sources = _skill_sources(repository_root)
    destination = resolve_destination(harness, scope, project, home)
    report: dict[str, Any] = {
        "harness": harness,
        "scope": scope,
        "source": str(source_root),
        "destination": str(destination),
        "install": [],
        "unchanged": [],
        "conflicts": [],
        "applied": False,
    }
    project_root = project.expanduser().resolve() if scope == "project" else None
    if project_root is not None:
        symlink = _path_symlink(project_root, destination)
        if symlink is not None:
            return _blocked(report, f"项目级 Skill 目标路径包含符号链接：{symlink}")

    try:
        with tempfile.TemporaryDirectory(prefix="mind-os-builder-skills-") as temporary:
            materialized = _materialize_skills(
                repository_root,
                sources,
                Path(temporary),
            )
            install: list[str] = []
            unchanged: list[str] = []
            conflicts: list[str] = []
            by_name = {source.name: source for source in materialized}

            for source in materialized:
                target = destination / source.name
                if project_root is not None:
                    symlink = _path_symlink(project_root, target)
                    if symlink is not None:
                        return _blocked(
                            report,
                            f"项目级 Skill 目标路径包含符号链接：{symlink}",
                        )
                if target.is_symlink():
                    if target.is_dir() and _tree_digest(source) == _tree_digest(target):
                        unchanged.append(source.name)
                    else:
                        conflicts.append(source.name)
                elif not target.exists():
                    install.append(source.name)
                elif (
                    target.is_dir()
                    and _symlink_in_tree(target) is None
                    and _tree_digest(source) == _tree_digest(target)
                ):
                    unchanged.append(source.name)
                else:
                    conflicts.append(source.name)

            report["install"] = install
            report["unchanged"] = unchanged
            report["conflicts"] = conflicts
            if conflicts:
                return _blocked(report, "目标中存在不同内容的同名 Skill；未写入任何文件")
            if not apply:
                report["status"] = "planned"
                report["message"] = "这是预演；添加 --apply 后才会复制文件"
                return report

            destination.mkdir(parents=True, exist_ok=True)
            for name in install:
                target = destination / name
                if project_root is not None:
                    symlink = _path_symlink(project_root, target)
                    if symlink is not None:
                        raise OSError(f"项目级 Skill 目标路径包含符号链接：{symlink}")
                staging = Path(
                    tempfile.mkdtemp(prefix=f".mindos-{name}-", dir=destination)
                )
                try:
                    shutil.copytree(by_name[name], staging, dirs_exist_ok=True)
                    os.rename(staging, target)
                    report["applied"] = True
                finally:
                    shutil.rmtree(staging, ignore_errors=True)

            report["status"] = "succeeded"
            report["message"] = "Skill 安装完成"
            return report
    except (OSError, ValueError) as exc:
        return _blocked(report, f"Skill 安装失败：{exc}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="把 Mind OS Agent Skills 安装到外层 Agent 宿主")
    parser.add_argument(
        "harness",
        choices=sorted(USER_SKILL_PATHS),
        help="Agent 宿主",
    )
    parser.add_argument("--scope", choices=("project", "user"), default="project")
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--apply", action="store_true", help="执行复制；省略时只预演")
    parser.add_argument("--json", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repository = Path(__file__).resolve().parents[1]
    try:
        report = install_skills(
            repository,
            args.harness,
            args.scope,
            args.project,
            Path.home(),
            apply=args.apply,
        )
    except (OSError, ValueError) as exc:
        report = {"status": "blocked", "message": str(exc)}

    if args.json:
        print(json.dumps(report, ensure_ascii=False))
    else:
        print(report["message"])
        if "destination" in report:
            print(f"目标：{report['destination']}")
            print(f"将安装：{', '.join(report['install']) or '无'}")
            print(f"已存在：{', '.join(report['unchanged']) or '无'}")
            print(f"冲突：{', '.join(report['conflicts']) or '无'}")
    return 2 if report["status"] == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
