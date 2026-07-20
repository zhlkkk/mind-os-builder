from __future__ import annotations

import os
from pathlib import Path


class PathViolation(ValueError):
    pass


class WriteGuard:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()

    def resolve(self, relative: Path, *, capability: str | None = None) -> Path:
        if relative.is_absolute() or ".." in relative.parts:
            raise PathViolation(f"path escapes vault: {relative}")
        candidate = self.root / relative
        current = self.root
        for part in relative.parts:
            current = current / part
            if current.is_symlink():
                raise PathViolation(f"symlink path is not writable: {relative}")
        resolved = candidate.resolve(strict=False)
        try:
            resolved.relative_to(self.root)
        except ValueError as exc:
            raise PathViolation(f"path escapes vault: {relative}") from exc
        logical = relative.as_posix()
        if logical == "wiki/insights" or logical.startswith("wiki/insights/"):
            raise PathViolation("wiki/insights is human-only")
        if logical == "raw/logseq-import" or logical.startswith("raw/logseq-import/"):
            raise PathViolation("raw/logseq-import is immutable")
        if logical.startswith("raw/research/") and capability != "research":
            raise PathViolation("raw/research requires research capability")
        return resolved

    def atomic_write(self, relative: Path, content: str, *, capability: str | None = None) -> Path:
        target = self.resolve(relative, capability=capability)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(f".{target.name}.{os.getpid()}.tmp")
        temporary.write_text(content, encoding="utf-8")
        os.replace(temporary, target)
        return target
