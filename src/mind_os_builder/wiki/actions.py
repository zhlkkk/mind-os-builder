from __future__ import annotations

import hashlib
import re
import tempfile
from pathlib import Path

import yaml

from mind_os_builder.core.locks import FileLock
from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.core.write_guard import WriteGuard


_PAGE_PATH = re.compile(
    r"^wiki/(?:concepts|entities|connections)/[a-z0-9]+(?:-[a-z0-9]+)*\.md$"
)
_REQUIRED_FIELDS = {"domain", "sources", "created", "updated", "tags"}


class WikiConflict(ValueError):
    """候选页面所依据的版本已经变化。"""


def ingest_page(
    vault_root: Path,
    page_path: str,
    content: str,
    *,
    expected_hash: str | None = None,
    apply: bool = False,
) -> RunEnvelope:
    """提交已经编译好的单个 Wiki 页面，并同步索引和日志。"""

    relative = Path(page_path)
    if _PAGE_PATH.fullmatch(relative.as_posix()) is None:
        raise ValueError("path 必须是受支持 Wiki 分区中的 kebab-case Markdown 文件")
    _validate_page(content)
    guard = WriteGuard(vault_root)
    current = _read_optional(guard, relative)
    if current != content:
        _validate_expected_hash(current, expected_hash)
    index_relative = Path("wiki/index.md")
    log_relative = Path("wiki/log.md")
    index = guard.resolve(index_relative).read_text(encoding="utf-8")
    log = guard.resolve(log_relative).read_text(encoding="utf-8")
    stem = relative.stem
    updated_index = index if f"[[{stem}]]" in index else f"{index.rstrip()}\n\n- [[{stem}]]\n"
    if current == content and updated_index == index:
        return RunEnvelope.noop("wiki.ingest")
    artifacts = [relative.as_posix(), index_relative.as_posix(), log_relative.as_posix()]
    if not apply:
        return RunEnvelope(
            task="wiki.ingest",
            status=RunStatus.SUCCEEDED,
            reason_code="dry_run",
            changed=True,
            artifacts=artifacts,
            metrics={
                "path": relative.as_posix(),
                "operation": "create" if current is None else "update",
            },
        )

    lock_key = hashlib.sha256(str(vault_root.resolve()).encode()).hexdigest()
    lock_path = Path(tempfile.gettempdir()) / "mind-os-builder-locks" / f"wiki-{lock_key}.lock"
    with FileLock(lock_path):
        current = _read_optional(guard, relative)
        if current != content:
            _validate_expected_hash(current, expected_hash)
        index = guard.resolve(index_relative).read_text(encoding="utf-8")
        log = guard.resolve(log_relative).read_text(encoding="utf-8")
        updated_index = index if f"[[{stem}]]" in index else f"{index.rstrip()}\n\n- [[{stem}]]\n"
        if current == content and updated_index == index:
            return RunEnvelope.noop("wiki.ingest")
        operation = "新增" if current is None else "更新"
        updated_log = (
            f"{log.rstrip()}\n\n- {operation} [[{stem}]]"
            f"（`{relative.as_posix()}`）。\n"
        )
        guard.atomic_write(relative, content)
        guard.atomic_write(index_relative, updated_index)
        guard.atomic_write(log_relative, updated_log)
    return RunEnvelope(
        task="wiki.ingest",
        status=RunStatus.SUCCEEDED,
        changed=True,
        artifacts=artifacts,
        metrics={
            "path": relative.as_posix(),
            "operation": "create" if current is None else "update",
        },
    )


def query_wiki(vault_root: Path, query: str, *, limit: int = 10) -> RunEnvelope:
    """在本地 Wiki 中执行确定性的文本检索，不做知识综合。"""

    needle = query.strip().casefold()
    if not needle:
        raise ValueError("query 不能为空")
    if not 1 <= limit <= 50:
        raise ValueError("limit 必须在 1 到 50 之间")
    wiki_root = vault_root.resolve() / "wiki"
    if not wiki_root.is_dir():
        raise ValueError("wiki 目录不存在")
    index = wiki_root / "index.md"
    paths = sorted(
        wiki_root.rglob("*.md"),
        key=lambda item: item.relative_to(wiki_root.parent).as_posix(),
    )
    if index in paths:
        paths.remove(index)
        paths.insert(0, index)
    matches: list[dict[str, str]] = []
    for path in paths:
        if path.is_symlink() or not path.resolve().is_relative_to(wiki_root):
            continue
        text = path.read_text(encoding="utf-8")
        offset = text.casefold().find(needle)
        if offset < 0:
            continue
        start = max(0, offset - 120)
        end = min(len(text), offset + len(query) + 280)
        matches.append(
            {
                "path": path.relative_to(vault_root).as_posix(),
                "excerpt": text[start:end].strip(),
            }
        )
        if len(matches) == limit:
            break
    return RunEnvelope(
        task="wiki.query",
        status=RunStatus.SUCCEEDED,
        reason_code="noop" if not matches else None,
        metrics={"query": query.strip(), "match_count": len(matches), "matches": matches},
    )


def _validate_page(content: str) -> None:
    if not content.startswith("---\n"):
        raise ValueError("页面缺少 YAML frontmatter")
    marker = content.find("\n---\n", 4)
    if marker < 0:
        raise ValueError("页面 YAML frontmatter 未闭合")
    metadata = yaml.safe_load(content[4:marker])
    if not isinstance(metadata, dict) or not _REQUIRED_FIELDS <= metadata.keys():
        raise ValueError("页面 frontmatter 缺少必需字段")


def _read_optional(guard: WriteGuard, relative: Path) -> str | None:
    target = guard.resolve(relative)
    return target.read_text(encoding="utf-8") if target.exists() else None


def _validate_expected_hash(current: str | None, expected_hash: str | None) -> None:
    if current is None:
        if expected_hash is not None:
            raise WikiConflict("候选页面已不存在")
        return
    current_hash = hashlib.sha256(current.encode()).hexdigest()
    if expected_hash is None or expected_hash != current_hash:
        raise WikiConflict("候选页面已变化")
