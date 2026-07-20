from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from mind_os_builder.distill.models import (
    DistillPlan,
    DistillTrigger,
    InvalidJournalPath,
    ParagraphContext,
    Persona,
)


@dataclass(frozen=True, slots=True)
class _Paragraph:
    text: str
    start: int
    end: int


_TAG_PATTERN = re.compile(
    r"#(?:(?P<book>book/(?P<book_slug>[\w-]+))|"
    r"(?P<persona>lumina|prism|vector|nexus|ember))(?![\w/-])"
)
_CALLOUT_HEADERS = {
    Persona.LUMINA: re.compile(r"^[ \t]*> \[!quote\] 🌿 Lumina\b", re.MULTILINE),
    Persona.PRISM: re.compile(r"^[ \t]*> \[!quote\] 🌌 Prism\b", re.MULTILINE),
    Persona.VECTOR: re.compile(r"^[ \t]*> \[!quote\] 🔨 Vector\b", re.MULTILINE),
    Persona.NEXUS: re.compile(r"^[ \t]*> \[!info\] 🌐 Nexus\b", re.MULTILINE),
    Persona.EMBER: re.compile(r"^[ \t]*> \[!quote\] 🔥 Ember\b", re.MULTILINE),
}


def scan_journal(vault_root: Path, source_path: Path) -> DistillPlan:
    relative, target = _resolve_journal(vault_root, source_path)
    content = target.read_text(encoding="utf-8")
    paragraphs = _split_paragraphs(content)
    triggers: list[DistillTrigger] = []
    occurrences: dict[tuple[str, Persona], int] = {}

    for index, paragraph in enumerate(paragraphs):
        personas: list[Persona] = []
        book_slug: str | None = None
        for match in _TAG_PATTERN.finditer(paragraph.text):
            if match.group("book") is not None:
                persona = Persona.EMBER
                book_slug = match.group("book_slug")
            else:
                persona = Persona(match.group("persona"))
            if persona not in personas:
                personas.append(persona)

        for persona in personas:
            normalized = _normalize(paragraph.text)
            occurrence_key = (normalized, persona)
            occurrence = occurrences.get(occurrence_key, 0)
            occurrences[occurrence_key] = occurrence + 1
            if persona in _adjacent_callout_personas(paragraphs, index):
                continue
            trigger_id = _trigger_id(relative, normalized, persona, occurrence)
            concurrency_key = (
                f"distill:{relative.as_posix()}:ember"
                if persona is Persona.EMBER
                else trigger_id
            )
            triggers.append(
                DistillTrigger(
                    trigger_id=trigger_id,
                    persona=persona,
                    source_path=relative,
                    paragraph=paragraph.text,
                    paragraph_occurrence=occurrence,
                    context=ParagraphContext(
                        before=tuple(item.text for item in paragraphs[max(0, index - 2) : index]),
                        after=tuple(item.text for item in paragraphs[index + 1 : index + 2]),
                    ),
                    concurrency_key=concurrency_key,
                    book_slug=book_slug if persona is Persona.EMBER else None,
                    mode=_nexus_mode(paragraph.text) if persona is Persona.NEXUS else None,
                )
            )

    return DistillPlan(
        source_path=relative,
        baseline_hash=_content_hash(content),
        triggers=tuple(triggers),
    )


def _adjacent_callout_personas(
    paragraphs: list[_Paragraph], paragraph_index: int
) -> set[Persona]:
    processed: set[Persona] = set()
    for paragraph in paragraphs[paragraph_index + 1 :]:
        if not paragraph.text.lstrip().startswith("> [!"):
            break
        for persona, pattern in _CALLOUT_HEADERS.items():
            if pattern.search(paragraph.text):
                processed.add(persona)
    return processed


def _resolve_journal(vault_root: Path, source_path: Path) -> tuple[Path, Path]:
    if source_path.is_absolute() or ".." in source_path.parts:
        raise InvalidJournalPath(f"journal path must be vault-relative: {source_path}")
    if source_path.parts[:1] != ("journals",) or source_path.suffix != ".md":
        raise InvalidJournalPath(f"distill only accepts journals/*.md: {source_path}")
    root = vault_root.resolve()
    target = (root / source_path).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise InvalidJournalPath(f"journal path escapes vault: {source_path}") from exc
    if not target.is_file():
        raise FileNotFoundError(target)
    return source_path, target


def _split_paragraphs(content: str) -> list[_Paragraph]:
    paragraphs: list[_Paragraph] = []
    pattern = re.compile(r"(?ms)(?:\A|\n[ \t]*\n)(?P<text>[^\n].*?)(?=\n[ \t]*\n|\Z)")
    for match in pattern.finditer(content):
        text = match.group("text").rstrip("\n")
        start = match.start("text")
        paragraphs.append(_Paragraph(text=text, start=start, end=start + len(text)))
    return paragraphs


def _normalize(paragraph: str) -> str:
    return "\n".join(line.rstrip() for line in paragraph.strip().splitlines())


def _trigger_id(relative: Path, paragraph: str, persona: Persona, occurrence: int) -> str:
    payload = "\0".join(("v1", relative.as_posix(), paragraph, persona.value, str(occurrence)))
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()[:20]
    return f"distill:v1:{digest}"


def _content_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _nexus_mode(paragraph: str) -> str:
    return "deep" if re.search(r"调研|深度|研报|competitive", paragraph, re.IGNORECASE) else "light"
