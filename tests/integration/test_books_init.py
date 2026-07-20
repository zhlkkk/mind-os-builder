from __future__ import annotations

from pathlib import Path

from mind_os_builder.books.init import initialize_books
from mind_os_builder.books.validate import validate_books_module
from mind_os_builder.wiki.init import initialize_vault


def _core_vault(tmp_path: Path) -> Path:
    vault = tmp_path / "vault"
    result = initialize_vault(vault, apply=True)
    assert result.exit_code == 0
    return vault


def test_books_init_installs_assets_and_is_idempotent(tmp_path: Path) -> None:
    vault = _core_vault(tmp_path)

    first = initialize_books(vault, apply=True)

    assert first.exit_code == 0
    assert first.changed is True
    assert (vault / "templates/book-template.md").is_file()
    assert (vault / "wiki/books/books.base").is_file()
    assert (vault / "wiki/books/example-book.md").is_file()
    assert "[[example-book]]" in (vault / "wiki/index.md").read_text(encoding="utf-8")
    assert "安装 Book Base" in (vault / "wiki/log.md").read_text(encoding="utf-8")
    assert validate_books_module(vault) == []

    template = vault / "templates/book-template.md"
    template.write_text(template.read_text(encoding="utf-8") + "\n用户注释\n", encoding="utf-8")
    second = initialize_books(vault, apply=True)

    assert second.exit_code == 0
    assert second.changed is False
    assert template.read_text(encoding="utf-8").endswith("用户注释\n")
    assert second.warnings
    assert (vault / "wiki/index.md").read_text(encoding="utf-8").count("[[example-book]]") == 1


def test_books_init_dry_run_has_no_filesystem_effect(tmp_path: Path) -> None:
    vault = _core_vault(tmp_path)
    before = {path.relative_to(vault) for path in vault.rglob("*")}

    result = initialize_books(vault, apply=False)

    after = {path.relative_to(vault) for path in vault.rglob("*")}
    assert result.reason_code == "dry_run"
    assert result.changed is True
    assert before == after
    assert not (vault / "wiki/books").exists()


def test_books_validation_rejects_runtime_markdown_in_books_folder(tmp_path: Path) -> None:
    vault = _core_vault(tmp_path)
    initialize_books(vault, apply=True)
    runtime_page = vault / "wiki/books/.mindos-runtime.md"
    runtime_page.write_text("runtime state", encoding="utf-8")

    issues = validate_books_module(vault)

    assert "runtime_file_in_books" in {issue.code for issue in issues}
