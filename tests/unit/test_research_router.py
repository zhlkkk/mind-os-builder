from mind_os_builder.research.models import ResearchMode
from mind_os_builder.research.router import normalize_provider_names, select_providers


def test_auto_mode_uses_existing_provider_order() -> None:
    available = {
        "google",
        "openrouter",
        "perplexity",
        "exa",
        "tavily-research",
        "tavily-search",
    }

    assert select_providers(ResearchMode.QUICK, available) == [
        "tavily-search",
        "exa",
        "perplexity",
        "openrouter",
        "google",
    ]
    assert select_providers(ResearchMode.STANDARD, available) == [
        "tavily-search",
        "exa",
        "perplexity",
        "openrouter",
        "google",
    ]
    assert select_providers(ResearchMode.DEEP, available) == [
        "tavily-search",
        "tavily-research",
        "exa",
        "perplexity",
        "openrouter",
        "google",
    ]


def test_provider_aliases_are_normalized_without_reordering() -> None:
    assert normalize_provider_names(
        ["grok", "google-ai", "tavily", "tavily_research", "exa"]
    ) == ("openrouter", "google", "tavily-search", "tavily-research", "exa")
