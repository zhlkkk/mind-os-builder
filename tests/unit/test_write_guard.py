from pathlib import Path

import pytest

from mind_os_builder.core.write_guard import PathViolation, WriteGuard


def test_write_guard_rejects_parent_escape(tmp_path) -> None:
    guard = WriteGuard(tmp_path)
    with pytest.raises(PathViolation):
        guard.resolve(Path("../outside.md"))


def test_write_guard_rejects_protected_paths(tmp_path) -> None:
    guard = WriteGuard(tmp_path)
    with pytest.raises(PathViolation):
        guard.resolve(Path("wiki/insights/private.md"))
    with pytest.raises(PathViolation):
        guard.resolve(Path("raw/logseq-import/history.md"))


def test_write_guard_rejects_symlink_escape(tmp_path) -> None:
    outside = tmp_path.parent / "outside"
    outside.mkdir(exist_ok=True)
    (tmp_path / "link").symlink_to(outside, target_is_directory=True)
    guard = WriteGuard(tmp_path)
    with pytest.raises(PathViolation):
        guard.resolve(Path("link/file.md"))
