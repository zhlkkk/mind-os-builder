from pathlib import Path

import pytest

from mind_os_builder.core.read_guard import ReadBoundaryError, ReadGuard


def test_read_guard_accepts_vault_relative_paths(tmp_path: Path) -> None:
    page = tmp_path / "wiki/radar.md"
    page.parent.mkdir()
    page.write_text("safe", encoding="utf-8")

    assert ReadGuard(tmp_path).resolve(Path("wiki/radar.md")) == page


@pytest.mark.parametrize("path", [Path("../secret.md"), Path("/tmp/secret.md")])
def test_read_guard_rejects_parent_and_absolute_paths(tmp_path: Path, path: Path) -> None:
    with pytest.raises(ReadBoundaryError, match="workspace boundary"):
        ReadGuard(tmp_path).resolve(path)


def test_read_guard_rejects_a_symlink_escape(tmp_path: Path) -> None:
    outside = tmp_path.parent / "outside-radar.md"
    outside.write_text("secret", encoding="utf-8")
    link = tmp_path / "wiki/radar.md"
    link.parent.mkdir()
    link.symlink_to(outside)

    with pytest.raises(ReadBoundaryError, match="workspace boundary"):
        ReadGuard(tmp_path).resolve(Path("wiki/radar.md"))
