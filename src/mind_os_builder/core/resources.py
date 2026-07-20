from __future__ import annotations

from importlib import resources
from importlib.resources.abc import Traversable
from pathlib import Path
from typing import Iterator


_SOURCE_PATHS = {
    "skills": Path(".agents/skills"),
    "agents": Path("agents"),
    "adapters": Path("adapters"),
    "jobs": Path("jobs"),
    "data": Path("data"),
}
_REPOSITORY_CANDIDATE = Path(__file__).resolve().parents[3]
_IS_SOURCE_CHECKOUT = (
    (_REPOSITORY_CANDIDATE / "pyproject.toml").is_file()
    and (_REPOSITORY_CANDIDATE / "src/mind_os_builder").is_dir()
)


def resource_tree(name: str) -> Traversable:
    """定位仓库顶层规范资源；安装后回退到 wheel 内的同一份资源。"""

    try:
        source_relative = _SOURCE_PATHS[name]
    except KeyError as exc:
        raise ValueError(f"unknown resource tree: {name}") from exc

    source = _REPOSITORY_CANDIDATE / source_relative
    if _IS_SOURCE_CHECKOUT and source.exists():
        return source
    return resources.files("mind_os_builder").joinpath("_bundle", name)


def resource_files(root: Traversable) -> Iterator[tuple[Path, Traversable]]:
    """递归枚举资源文件，并返回相对资源根目录的路径。"""

    def visit(item: Traversable, relative: Path) -> Iterator[tuple[Path, Traversable]]:
        if item.is_file():
            yield relative, item
            return
        for child in item.iterdir():
            yield from visit(child, relative / child.name)

    for child in root.iterdir():
        yield from visit(child, Path(child.name))
