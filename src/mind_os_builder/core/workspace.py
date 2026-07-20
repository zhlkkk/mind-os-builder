from __future__ import annotations

import tempfile
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


@contextmanager
def temporary_workspace(prefix: str = "mindos-") -> Iterator[Path]:
    with tempfile.TemporaryDirectory(prefix=prefix) as directory:
        yield Path(directory)
