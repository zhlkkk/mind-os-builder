from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from mind_os_builder.books.validate import validate_base_definition, validate_book_page
from mind_os_builder.core.resources import resource_tree


def _asset(relative: str) -> Path:
    return Path(str(resource_tree("data").joinpath("books", relative)))


def test_example_book_has_complete_frontmatter_and_ria_sections() -> None:
    page = _asset("wiki/books/example-book.md")

    assert validate_book_page(page) == []
    content = page.read_text(encoding="utf-8")
    assert "## 重要笔记 (R — Reading)" in content
    assert "## 我的内化 (I — Interpretation)" in content
    assert "## 我的应用 (A — Appropriation)" in content
    assert "## 与本 wiki 的连接" in content


@pytest.mark.parametrize(
    ("frontmatter", "expected_code"),
    [
        ({"status": None}, "missing_property"),
        ({"status": "paused"}, "invalid_status"),
        ({"created": "20-07-2026"}, "invalid_date"),
        ({"sources": "one"}, "invalid_sources"),
    ],
)
def test_book_validation_rejects_invalid_properties(
    tmp_path: Path, frontmatter: dict[str, object], expected_code: str
) -> None:
    valid = {
        "title": "合成书籍",
        "author": "示例作者",
        "status": "reading",
        "started": "2026-07-20",
        "finished": None,
        "created": "2026-07-20",
        "updated": "2026-07-20",
        "domain": "learning",
        "sources": 1,
        "tags": ["book"],
    }
    valid.update(frontmatter)
    page = tmp_path / "book.md"
    page.write_text(
        f"---\n{yaml.safe_dump(valid, allow_unicode=True, sort_keys=False)}---\n# 合成书籍\n",
        encoding="utf-8",
    )

    issues = validate_book_page(page)

    assert expected_code in {issue.code for issue in issues}


def test_base_definition_is_yaml_and_strictly_scoped_to_books() -> None:
    base = _asset("wiki/books/books.base")

    parsed = yaml.safe_load(base.read_text(encoding="utf-8"))
    assert isinstance(parsed, dict)
    assert validate_base_definition(base) == []
    rendered = yaml.safe_dump(parsed, allow_unicode=True)
    assert 'file.folder == "wiki/books"' in rendered
    assert 'file.ext == "md"' in rendered
    assert "raw/" not in rendered
    assert "journals/" not in rendered


def test_base_validation_rejects_a_filter_that_can_include_other_folders(tmp_path: Path) -> None:
    base = tmp_path / "books.base"
    base.write_text(
        "filters:\n  and:\n    - file.ext == \"md\"\nviews: []\n",
        encoding="utf-8",
    )

    issues = validate_base_definition(base)

    assert "unsafe_base_filter" in {issue.code for issue in issues}
