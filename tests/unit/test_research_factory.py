from dataclasses import replace

from mind_os_builder.research.config import default_research_settings
from mind_os_builder.research.factory import build_research_providers


def test_factory_preserves_order_and_excludes_disabled_providers() -> None:
    settings = default_research_settings()
    providers = dict(settings.providers)
    providers["exa"] = replace(providers["exa"], enabled=False)
    providers["google"] = replace(providers["google"], enabled=False)

    built = build_research_providers(replace(settings, providers=providers))

    assert [provider.name for provider in built] == [
        "tavily-search",
        "tavily-research",
        "perplexity",
        "openrouter",
    ]
