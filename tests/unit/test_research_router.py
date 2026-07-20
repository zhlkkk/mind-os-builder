from mind_os_builder.research.models import ResearchMode
from mind_os_builder.research.router import select_providers


def test_explicit_provider_order_wins() -> None:
    selected = select_providers(
        ResearchMode.DEEP,
        available={"search", "deep", "synthesis"},
        requested=["synthesis", "search"],
    )
    assert selected == ["synthesis", "search"]


def test_mode_selects_only_available_capabilities() -> None:
    assert select_providers(ResearchMode.QUICK, {"search"}) == ["search"]
    assert select_providers(ResearchMode.DEEP, {"search", "deep"}) == ["search", "deep"]
