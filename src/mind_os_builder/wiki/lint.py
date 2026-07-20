from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from pathlib import Path

import yaml


WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]")
SYSTEM_FILES = {"index.md", "log.md", "lint-report.md"}
REQUIRED_FIELDS = {"domain", "sources", "created", "updated", "tags"}


@dataclass(frozen=True, slots=True)
class LintIssue:
    code: str
    path: str
    message: str
    level: str = "error"


@dataclass(slots=True)
class LintReport:
    issues: list[LintIssue] = field(default_factory=list)

    @property
    def error_count(self) -> int:
        return sum(issue.level == "error" for issue in self.issues)

    def to_dict(self) -> dict[str, object]:
        return {"error_count": self.error_count, "issues": [asdict(item) for item in self.issues]}


def _frontmatter(text: str) -> dict[str, object] | None:
    if not text.startswith("---\n"):
        return None
    marker = text.find("\n---\n", 4)
    if marker < 0:
        return None
    parsed = yaml.safe_load(text[4:marker])
    return parsed if isinstance(parsed, dict) else None


def lint_vault(root: Path) -> LintReport:
    report = LintReport()
    wiki = root / "wiki"
    if not wiki.is_dir():
        report.issues.append(LintIssue("wiki_missing", "wiki", "wiki directory is missing"))
        return report
    index_text = (wiki / "index.md").read_text(encoding="utf-8") if (wiki / "index.md").exists() else ""
    pages = [
        path
        for path in wiki.rglob("*.md")
        if path.name not in SYSTEM_FILES and "insights" not in path.relative_to(wiki).parts
    ]
    known = {path.stem for path in pages}
    inbound = {stem: 0 for stem in known}
    for page in pages:
        relative = page.relative_to(root).as_posix()
        text = page.read_text(encoding="utf-8")
        metadata = _frontmatter(text)
        if metadata is None:
            report.issues.append(LintIssue("frontmatter_missing", relative, "missing YAML frontmatter"))
        else:
            missing = sorted(REQUIRED_FIELDS - metadata.keys())
            if missing:
                report.issues.append(
                    LintIssue("frontmatter_incomplete", relative, f"missing fields: {', '.join(missing)}")
                )
        if len(text.splitlines()) > 500:
            report.issues.append(LintIssue("page_too_long", relative, "page exceeds 500 lines", "warning"))
        if f"[[{page.stem}]]" not in index_text:
            report.issues.append(LintIssue("index_missing", relative, "page is absent from wiki/index.md"))
        for target in WIKILINK.findall(text):
            stem = Path(target).stem
            if target.startswith(("raw/", "journals/")):
                continue
            if stem in known:
                inbound[stem] += 1
            else:
                report.issues.append(LintIssue("red_link", relative, f"missing target: {target}", "warning"))
    for stem, count in inbound.items():
        if count == 0 and f"[[{stem}]]" not in index_text:
            report.issues.append(LintIssue("orphan_page", stem, "page has no inbound links", "warning"))
    return report
