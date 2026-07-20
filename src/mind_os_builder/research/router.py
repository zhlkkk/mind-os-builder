from __future__ import annotations

from collections.abc import Iterable

from mind_os_builder.research.models import ResearchMode


PROVIDER_ORDER = (
    "tavily-search",
    "tavily-research",
    "exa",
    "perplexity",
    "openrouter",
    "google",
)
MODE_PROVIDERS = {
    ResearchMode.QUICK: (
        "tavily-search",
        "exa",
        "perplexity",
        "openrouter",
        "google",
    ),
    ResearchMode.STANDARD: (
        "tavily-search",
        "exa",
        "perplexity",
        "openrouter",
        "google",
    ),
    ResearchMode.DEEP: PROVIDER_ORDER,
}
PROVIDER_ALIASES = {
    "grok": "openrouter",
    "openrouter-grok": "openrouter",
    "gemini": "google",
    "google-ai": "google",
    "tavily": "tavily-search",
    "tavily_search": "tavily-search",
    "tavily_research": "tavily-research",
}


def select_providers(
    mode: ResearchMode,
    available: Iterable[str],
) -> list[str]:
    available_set = set(available)
    return [name for name in MODE_PROVIDERS[mode] if name in available_set]


def normalize_provider_names(values: Iterable[str]) -> tuple[str, ...]:
    normalized = (
        PROVIDER_ALIASES.get(value.strip().lower(), value.strip().lower())
        for value in values
        if value.strip()
    )
    return tuple(dict.fromkeys(normalized))
