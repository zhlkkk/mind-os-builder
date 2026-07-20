from mind_os_builder.research.models import ResearchMode
from mind_os_builder.research.router import select_providers


def test_mode_selects_only_available_capabilities() -> None:
    assert select_providers(ResearchMode.QUICK, {"search"}) == ["search"]
    assert select_providers(ResearchMode.DEEP, {"search", "deep"}) == ["search", "deep"]
