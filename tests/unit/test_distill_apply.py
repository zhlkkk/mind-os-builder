from pathlib import Path

import pytest

from mind_os_builder.distill.apply import apply_responses
from mind_os_builder.distill.models import (
    DistillConflict,
    InvalidRoleOutput,
    Persona,
    RoleOutput,
)
from mind_os_builder.distill.scanner import scan_journal


def test_apply_defaults_to_dry_run_without_writing(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    original = "这是一段合成感受。 #lumina\n"
    journal.write_text(original, encoding="utf-8")
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    trigger = plan.triggers[0]
    output = RoleOutput(
        trigger_id=trigger.trigger_id,
        persona=Persona.LUMINA,
        callout=(
            "> [!quote] 🌿 Lumina (10:20)\n"
            "> 我注意到，这段疲惫需要先被看见。"
        ),
    )

    result = apply_responses(vault, plan, [output])

    assert result.dry_run is True
    assert result.changed is True
    assert result.planned_trigger_ids == (trigger.trigger_id,)
    assert result.applied_trigger_ids == ()
    assert journal.read_text(encoding="utf-8") == original


def test_apply_writes_once_and_reuses_marker_for_idempotency(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text("一个待回应的问题。 #prism\n", encoding="utf-8")
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    trigger = plan.triggers[0]
    output = RoleOutput(
        trigger_id=trigger.trigger_id,
        persona=Persona.PRISM,
        callout=(
            "> [!quote] 🌌 Prism (10:21)\n"
            "> **What if** 把问题的前提反过来？"
        ),
    )

    first = apply_responses(vault, plan, [output], apply=True)
    first_content = journal.read_text(encoding="utf-8")
    second = apply_responses(vault, plan, [output], apply=True)

    assert first.applied_trigger_ids == (trigger.trigger_id,)
    assert first.changed is True
    assert f"> <!-- mindos:distill:{trigger.trigger_id} -->" in first_content
    assert first_content.count("🌌 Prism") == 1
    assert second.changed is False
    assert second.skipped_trigger_ids == (trigger.trigger_id,)
    assert journal.read_text(encoding="utf-8") == first_content


def test_apply_indents_callouts_under_list_items(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text(
        "1. 顶层行动。 #vector\n\n    1. 嵌套想法。 #prism\n",
        encoding="utf-8",
    )
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    vector, prism = plan.triggers
    outputs = [
        RoleOutput(
            trigger_id=vector.trigger_id,
            persona=Persona.VECTOR,
            callout="> [!quote] 🔨 Vector (10:22)\n> - [ ] 完成一个合成动作。",
        ),
        RoleOutput(
            trigger_id=prism.trigger_id,
            persona=Persona.PRISM,
            callout="> [!quote] 🌌 Prism (10:23)\n> **What if** 换一个框架？",
        ),
    ]

    apply_responses(vault, plan, outputs, apply=True)
    content = journal.read_text(encoding="utf-8")

    assert "\n    > [!quote] 🔨 Vector (10:22)" in content
    assert "\n        > [!quote] 🌌 Prism (10:23)" in content


@pytest.mark.parametrize(
    "requested_path",
    [
        Path("journals/other.md"),
        Path("raw/research/report.md"),
        Path("wiki/insights/private.md"),
    ],
)
def test_apply_rejects_role_requested_writes(
    tmp_path: Path, requested_path: Path
) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    original = "请做合成调研。 #nexus\n"
    journal.write_text(original, encoding="utf-8")
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    trigger = plan.triggers[0]
    output = RoleOutput(
        trigger_id=trigger.trigger_id,
        persona=Persona.NEXUS,
        callout="> [!info] 🌐 Nexus (10:24)\n> 合成结论。",
        requested_writes=(requested_path,),
    )

    with pytest.raises(InvalidRoleOutput, match="cannot request file writes"):
        apply_responses(vault, plan, [output], apply=True)

    assert journal.read_text(encoding="utf-8") == original


def test_apply_rejects_stale_edited_trigger_paragraph(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text("原始行动。 #vector\n", encoding="utf-8")
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    trigger = plan.triggers[0]
    journal.write_text("已被用户改写的行动。 #vector\n", encoding="utf-8")
    output = RoleOutput(
        trigger_id=trigger.trigger_id,
        persona=Persona.VECTOR,
        callout="> [!quote] 🔨 Vector (10:25)\n> - [ ] 合成动作。",
    )

    with pytest.raises(DistillConflict, match="baseline changed"):
        apply_responses(vault, plan, [output], apply=True)

    assert "Vector (10:25)" not in journal.read_text(encoding="utf-8")


def test_apply_rejects_any_unreviewed_baseline_change(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text("原始行动。 #vector\n", encoding="utf-8")
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    trigger = plan.triggers[0]
    journal.write_text("原始行动。 #vector\n\n用户追加了另一段。\n", encoding="utf-8")
    output = RoleOutput(
        trigger_id=trigger.trigger_id,
        persona=Persona.VECTOR,
        callout="> [!quote] 🔨 Vector (10:26)\n> - [ ] 合成动作。",
    )

    with pytest.raises(DistillConflict, match="baseline changed"):
        apply_responses(vault, plan, [output], apply=True)
