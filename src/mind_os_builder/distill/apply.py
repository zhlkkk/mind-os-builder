from __future__ import annotations

import hashlib
import re
import tempfile
from collections.abc import Iterable
from pathlib import Path

from mind_os_builder.core.locks import FileLock
from mind_os_builder.core.write_guard import WriteGuard
from mind_os_builder.distill.idempotency import marker_for, was_applied
from mind_os_builder.distill.models import (
    ApplyResult,
    DistillConflict,
    DistillPlan,
    DistillTrigger,
    InvalidJournalPath,
    InvalidRoleOutput,
    Persona,
    RoleOutput,
)
from mind_os_builder.distill.scanner import (
    _Paragraph,
    _adjacent_callout_personas,
    _normalize,
    _split_paragraphs,
)


_ROLE_HEADERS = {
    Persona.LUMINA: re.compile(r"^> \[!quote\] 🌿 Lumina \(\d{2}:\d{2}\)$"),
    Persona.PRISM: re.compile(r"^> \[!quote\] 🌌 Prism \(\d{2}:\d{2}\)$"),
    Persona.VECTOR: re.compile(r"^> \[!quote\] 🔨 Vector \(\d{2}:\d{2}\)$"),
    Persona.NEXUS: re.compile(r"^> \[!info\] 🌐 Nexus \(\d{2}:\d{2}\)$"),
    Persona.EMBER: re.compile(r"^> \[!quote\] 🔥 Ember \(\d{2}:\d{2}\)$"),
}


def apply_responses(
    vault_root: Path,
    plan: DistillPlan,
    responses: Iterable[RoleOutput],
    *,
    apply: bool = False,
) -> ApplyResult:
    ordered = _validate_responses(plan, tuple(responses))
    planned = tuple(item.trigger_id for item in ordered)
    if not apply:
        return ApplyResult(
            changed=bool(planned),
            dry_run=True,
            planned_trigger_ids=planned,
        )
    return _apply_under_lock(vault_root, plan, ordered, planned)


def _apply_under_lock(
    vault_root: Path,
    plan: DistillPlan,
    responses: tuple[RoleOutput, ...],
    planned: tuple[str, ...],
) -> ApplyResult:
    if plan.source_path.parts[:1] != ("journals",) or plan.source_path.suffix != ".md":
        raise InvalidJournalPath(f"distill only writes journals/*.md: {plan.source_path}")
    lock_root = Path(tempfile.gettempdir()) / "mind-os-builder-locks"
    lock_key = hashlib.sha256(
        f"{vault_root.resolve()}\0{plan.source_path.as_posix()}".encode()
    ).hexdigest()
    with FileLock(lock_root / f"distill-{lock_key}.lock"):
        guard = WriteGuard(vault_root)
        target = guard.resolve(plan.source_path)
        content = target.read_text(encoding="utf-8")
        paragraphs = _split_paragraphs(content)
        trigger_by_id = {trigger.trigger_id: trigger for trigger in plan.triggers}
        insertions: list[tuple[int, int, str, str]] = []
        skipped: list[str] = []
        warnings: list[str] = []
        plan_order = {trigger.trigger_id: index for index, trigger in enumerate(plan.triggers)}

        for response in responses:
            if was_applied(content, response.trigger_id):
                skipped.append(response.trigger_id)
                continue
            trigger = trigger_by_id[response.trigger_id]
            paragraph_index = _find_trigger_paragraph(paragraphs, trigger)
            if response.persona in _adjacent_callout_personas(paragraphs, paragraph_index):
                skipped.append(response.trigger_id)
                if response.persona is Persona.NEXUS:
                    warnings.append(
                        f"detected nexus journal write for {response.trigger_id}; skipped"
                    )
                continue
            paragraph = paragraphs[paragraph_index]
            rendered = _render_callout(trigger.paragraph, response.callout, response.trigger_id)
            insertions.append(
                (paragraph.end, plan_order[response.trigger_id], response.trigger_id, rendered)
            )

        if not insertions:
            return ApplyResult(
                changed=False,
                dry_run=False,
                planned_trigger_ids=planned,
                skipped_trigger_ids=tuple(skipped),
                warnings=tuple(warnings),
            )

        updated = content
        for offset, order, trigger_id, rendered in sorted(insertions, reverse=True):
            del order, trigger_id
            updated = updated[:offset] + rendered + updated[offset:]
        guard.atomic_write(plan.source_path, updated)
        applied = tuple(item[2] for item in sorted(insertions, key=lambda item: item[1]))
        return ApplyResult(
            changed=True,
            dry_run=False,
            planned_trigger_ids=planned,
            applied_trigger_ids=applied,
            skipped_trigger_ids=tuple(skipped),
            warnings=tuple(warnings),
            artifacts=(plan.source_path,),
        )


def _validate_responses(
    plan: DistillPlan, responses: tuple[RoleOutput, ...]
) -> tuple[RoleOutput, ...]:
    triggers = {trigger.trigger_id: trigger for trigger in plan.triggers}
    by_id: dict[str, RoleOutput] = {}
    for response in responses:
        trigger = triggers.get(response.trigger_id)
        if trigger is None:
            raise InvalidRoleOutput(f"unknown trigger_id: {response.trigger_id}")
        if response.trigger_id in by_id:
            raise InvalidRoleOutput(f"duplicate role output: {response.trigger_id}")
        if response.persona is not trigger.persona:
            raise InvalidRoleOutput(
                f"persona mismatch for {response.trigger_id}: {response.persona.value}"
            )
        if response.requested_writes:
            raise InvalidRoleOutput("role output cannot request file writes")
        _validate_callout(response)
        by_id[response.trigger_id] = response
    return tuple(by_id[trigger.trigger_id] for trigger in plan.triggers if trigger.trigger_id in by_id)


def _validate_callout(response: RoleOutput) -> None:
    callout = response.callout.strip()
    lines = callout.splitlines()
    if len(lines) < 2 or _ROLE_HEADERS[response.persona].fullmatch(lines[0]) is None:
        raise InvalidRoleOutput(f"invalid {response.persona.value} callout header")
    if any(not line.startswith(">") for line in lines):
        raise InvalidRoleOutput("every callout line must start with '>'")
    if "mindos:distill:" in callout:
        raise InvalidRoleOutput("role output cannot forge an idempotency marker")


def _find_trigger_paragraph(paragraphs: list[_Paragraph], trigger: DistillTrigger) -> int:
    normalized = _normalize(trigger.paragraph)
    matches = [
        index
        for index, paragraph in enumerate(paragraphs)
        if _normalize(paragraph.text) == normalized
    ]
    if trigger.paragraph_occurrence >= len(matches):
        raise DistillConflict(f"trigger paragraph changed: {trigger.trigger_id}")
    return matches[trigger.paragraph_occurrence]


def _render_callout(paragraph: str, callout: str, trigger_id: str) -> str:
    prefix = _callout_indent(paragraph)
    lines = callout.strip().splitlines()
    lines.append(marker_for(trigger_id))
    return "\n\n" + "\n".join(f"{prefix}{line}" for line in lines)


def _callout_indent(paragraph: str) -> str:
    first_line = paragraph.splitlines()[0]
    match = re.match(r"^(?P<indent>[ \t]*)(?:[-+*]|\d+[.)])\s+", first_line)
    if match is None:
        return ""
    indent = match.group("indent")
    return f"{indent}\t" if "\t" in indent else f"{indent}    "
