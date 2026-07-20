from __future__ import annotations

from pathlib import Path


class ReadBoundaryError(ValueError):
    """只读路径越出固定工作区边界。"""


class ReadGuard:
    """把调用方提供的只读相对路径约束在固定根目录内。"""

    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def resolve(self, relative: Path) -> Path:
        if relative.is_absolute() or ".." in relative.parts:
            raise ReadBoundaryError("read path violates workspace boundary")
        resolved = (self.root / relative).resolve(strict=False)
        if not resolved.is_relative_to(self.root):
            raise ReadBoundaryError("read path violates workspace boundary")
        return resolved

    def relative(self, relative: Path) -> Path:
        return self.resolve(relative).relative_to(self.root)
