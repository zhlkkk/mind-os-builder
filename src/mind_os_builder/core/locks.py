from __future__ import annotations

import fcntl
from pathlib import Path
from types import TracebackType
from typing import TextIO


class FileLock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self._handle: TextIO | None = None

    def __enter__(self) -> FileLock:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open("a+", encoding="utf-8")
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        self._handle = handle
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        handle = self._handle
        if handle is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            handle.close()
        self._handle = None
