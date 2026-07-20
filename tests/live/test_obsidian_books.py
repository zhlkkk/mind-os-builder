from __future__ import annotations

import os
from pathlib import Path

import pytest

from mind_os_builder.books.validate import validate_books_module


@pytest.mark.live
def test_books_base_opened_and_edited_in_real_obsidian() -> None:
    vault_value = os.getenv("MINDOS_OBSIDIAN_BOOKS_VAULT")
    if not vault_value:
        pytest.skip("MINDOS_OBSIDIAN_BOOKS_VAULT 未设置，跳过真实 Obsidian 验收")

    vault = Path(vault_value)
    assert validate_books_module(vault) == []
    assert os.getenv("MINDOS_OBSIDIAN_BOOKS_CONFIRMED") == "1", (
        "请在 Obsidian 中确认正在读/已读完视图，修改 status 并确认回写后，"
        "设置 MINDOS_OBSIDIAN_BOOKS_CONFIRMED=1"
    )
