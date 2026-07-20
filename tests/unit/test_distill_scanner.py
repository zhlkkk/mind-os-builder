from pathlib import Path

from mind_os_builder.distill.models import Persona
from mind_os_builder.distill.scanner import scan_journal


def test_scan_returns_stable_trigger_with_context(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text(
        "开场。\n\n前一段。\n\n这件事让我有些疲惫。 #lumina\n\n后一段。\n",
        encoding="utf-8",
    )

    first = scan_journal(vault, Path("journals/2026-07-20.md"))
    second = scan_journal(vault, Path("journals/2026-07-20.md"))
    journal.write_text(
        "改写后的开场。\n\n前一段。\n\n这件事让我有些疲惫。 #lumina\n\n后一段。\n",
        encoding="utf-8",
    )
    changed_context = scan_journal(vault, Path("journals/2026-07-20.md"))

    assert len(first.triggers) == 1
    trigger = first.triggers[0]
    assert trigger.persona is Persona.LUMINA
    assert trigger.source_path == Path("journals/2026-07-20.md")
    assert trigger.paragraph == "这件事让我有些疲惫。 #lumina"
    assert trigger.context.before == ("开场。", "前一段。")
    assert trigger.context.after == ("后一段。",)
    assert trigger.trigger_id == second.triggers[0].trigger_id
    assert trigger.trigger_id == changed_context.triggers[0].trigger_id
    assert first.baseline_hash != changed_context.baseline_hash
    assert trigger.trigger_id.startswith("distill:v1:")


def test_scan_dispatches_multiple_tags_and_specializes_book_tag(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text(
        "一个合成触动点。 #lumina #ember #book/deep-work #prism #lumina-extra\n",
        encoding="utf-8",
    )

    plan = scan_journal(vault, Path("journals/2026-07-20.md"))

    assert [trigger.persona for trigger in plan.triggers] == [
        Persona.LUMINA,
        Persona.EMBER,
        Persona.PRISM,
    ]
    assert plan.triggers[1].book_slug == "deep-work"


def test_scan_skips_only_adjacent_matching_callouts(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text(
        "已处理的感受。 #lumina\n\n"
        "> [!quote] 🌿 Lumina (09:10)\n"
        "> 一段合成回复。\n\n"
        "还未处理的想法。 #prism\n\n"
        "另一段内容。\n\n"
        "> [!quote] 🌌 Prism (09:11)\n"
        "> 这不是紧邻回复。\n",
        encoding="utf-8",
    )

    plan = scan_journal(vault, Path("journals/2026-07-20.md"))

    assert [trigger.persona for trigger in plan.triggers] == [Persona.PRISM]


def test_scan_assigns_ember_concurrency_key_and_nexus_mode(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text(
        "火星一。 #ember\n\n"
        "火星二。 #book/synthetic-book\n\n"
        "感受一。 #lumina\n\n"
        "感受二。 #lumina\n\n"
        "请做一份 competitive 调研。 #nexus\n",
        encoding="utf-8",
    )

    plan = scan_journal(vault, Path("journals/2026-07-20.md"))
    ember = [item for item in plan.triggers if item.persona is Persona.EMBER]
    lumina = [item for item in plan.triggers if item.persona is Persona.LUMINA]
    nexus = next(item for item in plan.triggers if item.persona is Persona.NEXUS)

    assert ember[0].concurrency_key == ember[1].concurrency_key
    assert lumina[0].concurrency_key != lumina[1].concurrency_key
    assert nexus.mode == "deep"
