from pathlib import Path

from mind_os_builder.distill.dispatch import dispatch_waves
from mind_os_builder.distill.models import Persona
from mind_os_builder.distill.scanner import scan_journal


def test_dispatch_waves_serialize_only_ember(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    journal = vault / "journals/2026-07-20.md"
    journal.parent.mkdir(parents=True)
    journal.write_text(
        "感受。 #lumina\n\n火星一。 #ember\n\n创意。 #prism\n\n火星二。 #book/demo\n",
        encoding="utf-8",
    )
    plan = scan_journal(vault, Path("journals/2026-07-20.md"))

    waves = dispatch_waves(plan)

    assert [item.persona for item in waves[0]] == [
        Persona.LUMINA,
        Persona.PRISM,
        Persona.EMBER,
    ]
    assert [item.persona for item in waves[1]] == [Persona.EMBER]
