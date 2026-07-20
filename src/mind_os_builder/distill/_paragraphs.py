from __future__ import annotations

import re
from dataclasses import dataclass

from mind_os_builder.distill.models import Persona


@dataclass(frozen=True, slots=True)
class Paragraph:
    text: str
    start: int
    end: int


CALLOUT_HEADERS = {
    Persona.LUMINA: re.compile(r"^[ \t]*> \[!quote\] 🌿 Lumina\b", re.MULTILINE),
    Persona.PRISM: re.compile(r"^[ \t]*> \[!quote\] 🌌 Prism\b", re.MULTILINE),
    Persona.VECTOR: re.compile(r"^[ \t]*> \[!quote\] 🔨 Vector\b", re.MULTILINE),
    Persona.NEXUS: re.compile(r"^[ \t]*> \[!info\] 🌐 Nexus\b", re.MULTILINE),
    Persona.EMBER: re.compile(r"^[ \t]*> \[!quote\] 🔥 Ember\b", re.MULTILINE),
}


def split_paragraphs(content: str) -> list[Paragraph]:
    paragraphs: list[Paragraph] = []
    pattern = re.compile(r"(?ms)(?:\A|\n[ \t]*\n)(?P<text>[^\n].*?)(?=\n[ \t]*\n|\Z)")
    for match in pattern.finditer(content):
        text = match.group("text").rstrip("\n")
        start = match.start("text")
        paragraphs.append(Paragraph(text=text, start=start, end=start + len(text)))
    return paragraphs


def normalize_paragraph(paragraph: str) -> str:
    return "\n".join(line.rstrip() for line in paragraph.strip().splitlines())


def adjacent_callout_personas(
    paragraphs: list[Paragraph], paragraph_index: int
) -> set[Persona]:
    processed: set[Persona] = set()
    for paragraph in paragraphs[paragraph_index + 1 :]:
        if not paragraph.text.lstrip().startswith("> [!"):
            break
        for persona, pattern in CALLOUT_HEADERS.items():
            if pattern.search(paragraph.text):
                processed.add(persona)
    return processed
