from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import yaml


BOOK_STATUSES = frozenset({"reading", "done", "shelved"})
REQUIRED_PROPERTIES = frozenset(
    {"title", "author", "status", "domain", "sources", "created", "updated", "tags"}
)
DATE_PROPERTIES = frozenset({"started", "finished", "created", "updated"})
REQUIRED_BASE_FILTERS = frozenset(
    {
        'file.folder == "wiki/books"',
        'file.ext == "md"',
        'file.name != "density-tracker"',
        '!file.name.startsWith(".")',
        '!file.name.endsWith(".runtime")',
    }
)


@dataclass(frozen=True, slots=True)
class BookIssue:
    code: str
    path: str
    message: str


def _frontmatter(path: Path) -> tuple[dict[str, Any] | None, list[BookIssue]]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return None, [BookIssue("missing_frontmatter", str(path), "缺少 YAML frontmatter")]
    try:
        _, block, _ = text.split("---", 2)
        data = yaml.safe_load(block)
    except (ValueError, yaml.YAMLError) as exc:
        return None, [BookIssue("invalid_frontmatter", str(path), str(exc))]
    if not isinstance(data, dict):
        return None, [BookIssue("invalid_frontmatter", str(path), "frontmatter 必须是对象")]
    return data, []


def _is_iso_date(value: object) -> bool:
    if isinstance(value, date):
        return True
    if not isinstance(value, str):
        return False
    try:
        return date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def validate_book_page(path: Path) -> list[BookIssue]:
    data, issues = _frontmatter(path)
    if data is None:
        return issues

    for key in sorted(REQUIRED_PROPERTIES):
        if key not in data or data[key] is None or data[key] == "":
            issues.append(BookIssue("missing_property", str(path), f"缺少属性：{key}"))

    status = data.get("status")
    if status is not None and status not in BOOK_STATUSES:
        issues.append(BookIssue("invalid_status", str(path), f"未知阅读状态：{status}"))

    for key in sorted(DATE_PROPERTIES):
        value = data.get(key)
        if value not in (None, "") and not _is_iso_date(value):
            issues.append(BookIssue("invalid_date", str(path), f"{key} 必须是 YYYY-MM-DD"))

    sources = data.get("sources")
    if sources is not None and (not isinstance(sources, int) or isinstance(sources, bool) or sources < 0):
        issues.append(BookIssue("invalid_sources", str(path), "sources 必须是非负整数"))

    tags = data.get("tags")
    if tags is not None and (not isinstance(tags, list) or not all(isinstance(tag, str) for tag in tags)):
        issues.append(BookIssue("invalid_tags", str(path), "tags 必须是字符串列表"))
    return issues


def validate_base_definition(path: Path) -> list[BookIssue]:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        return [BookIssue("invalid_base", str(path), str(exc))]
    if not isinstance(data, dict):
        return [BookIssue("invalid_base", str(path), ".base 必须是 YAML 对象")]

    filters = data.get("filters")
    expressions = filters.get("and") if isinstance(filters, dict) else None
    if not isinstance(expressions, list) or not all(isinstance(item, str) for item in expressions):
        return [BookIssue("unsafe_base_filter", str(path), "缺少顶层 and 过滤")]
    if set(expressions) != REQUIRED_BASE_FILTERS:
        return [
            BookIssue(
                "unsafe_base_filter",
                str(path),
                "Base 必须严格限定 wiki/books 与 Markdown，并排除运行态文件",
            )
        ]
    return []


def _is_runtime_page(path: Path) -> bool:
    return (
        path.name.startswith(".")
        or path.stem == "density-tracker"
        or path.stem.endswith(".runtime")
    )


def validate_books_module(vault_root: Path) -> list[BookIssue]:
    books = vault_root / "wiki/books"
    base = books / "books.base"
    issues: list[BookIssue] = []
    if not base.is_file():
        issues.append(BookIssue("missing_base", str(base), "缺少 books.base"))
    else:
        issues.extend(validate_base_definition(base))

    if not books.is_dir():
        issues.append(BookIssue("missing_books_directory", str(books), "缺少 wiki/books"))
        return issues
    for page in sorted(books.glob("*.md")):
        if _is_runtime_page(page):
            issues.append(
                BookIssue("runtime_file_in_books", str(page), "运行态 Markdown 不得进入 Book Base 目录")
            )
            continue
        issues.extend(validate_book_page(page))
    return issues
