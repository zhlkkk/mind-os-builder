from pathlib import Path

from mind_os_builder.distill.apply import apply_responses
from mind_os_builder.distill.models import Persona, RoleOutput
from mind_os_builder.distill.scanner import scan_journal


CALLOUTS = {
    Persona.LUMINA: "> [!quote] 🌿 Lumina (11:00)\n> 合成的情绪映照。",
    Persona.PRISM: "> [!quote] 🌌 Prism (11:01)\n> **What if** 使用另一个框架？",
    Persona.VECTOR: "> [!quote] 🔨 Vector (11:02)\n> - [ ] 完成合成动作。",
    Persona.NEXUS: "> [!info] 🌐 Nexus (11:03)\n> 合成调研结论。",
    Persona.EMBER: "> [!quote] 🔥 Ember (11:04)\n> 这个合成触动点值得重述。",
}


def test_distill_scan_apply_flow_handles_nexus_overreach(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text(
        "情绪段落。 #lumina\n\n"
        "创意段落。 #prism\n\n"
        "行动段落。 #vector\n\n"
        "调研段落。 #nexus\n\n"
        "读书触动。 #book/synthetic-book\n",
        encoding="utf-8",
    )
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    outputs = [
        RoleOutput(item.trigger_id, item.persona, CALLOUTS[item.persona])
        for item in plan.triggers
    ]
    nexus = next(item for item in plan.triggers if item.persona is Persona.NEXUS)
    content = journal.read_text(encoding="utf-8")
    content = content.replace(
        nexus.paragraph,
        f"{nexus.paragraph}\n\n{CALLOUTS[Persona.NEXUS]}",
    )
    journal.write_text(content, encoding="utf-8")

    result = apply_responses(vault, plan, outputs, apply=True)

    assert nexus.trigger_id in result.skipped_trigger_ids
    assert any("detected nexus journal write" in warning for warning in result.warnings)
    assert len(result.applied_trigger_ids) == 4
    assert scan_journal(vault, Path("journals/2026-07-20.md")).triggers == ()
