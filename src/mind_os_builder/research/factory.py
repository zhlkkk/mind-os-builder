from __future__ import annotations

from mind_os_builder.research.config import ResearchSettings
from mind_os_builder.research.contracts import ResearchProvider
from mind_os_builder.research.http import JsonHttpClient
from mind_os_builder.research.providers import (
    ExaProvider,
    GoogleProvider,
    OpenRouterProvider,
    PerplexityProvider,
    TavilyResearchProvider,
    TavilySearchProvider,
)


def build_research_providers(settings: ResearchSettings) -> list[ResearchProvider]:
    http = JsonHttpClient(
        attempts=settings.attempts,
        retry_backoff_seconds=settings.retry_backoff_seconds,
    )
    configured: list[ResearchProvider] = []
    tavily_search = settings.providers["tavily-search"]
    if tavily_search.enabled:
        configured.append(
            TavilySearchProvider(
                key_env=tavily_search.key_env,
                timeout=settings.timeout_seconds,
                http=http,
            )
        )
    tavily_research = settings.providers["tavily-research"]
    if tavily_research.enabled:
        configured.append(
            TavilyResearchProvider(
                key_env=tavily_research.key_env,
                timeout=settings.timeout_seconds,
                max_wait_seconds=settings.tavily_research_wait_seconds,
                poll_interval_seconds=settings.tavily_poll_interval_seconds,
                http=http,
            )
        )
    exa = settings.providers["exa"]
    if exa.enabled:
        configured.append(
            ExaProvider(key_env=exa.key_env, timeout=settings.timeout_seconds, http=http)
        )
    perplexity = settings.providers["perplexity"]
    if perplexity.enabled:
        configured.append(
            PerplexityProvider(
                key_env=perplexity.key_env,
                model=perplexity.model or "sonar-pro",
                deep_model=perplexity.deep_model or "sonar-deep-research",
                timeout=settings.timeout_seconds,
                http=http,
            )
        )
    openrouter = settings.providers["openrouter"]
    if openrouter.enabled:
        configured.append(
            OpenRouterProvider(
                key_env=openrouter.key_env,
                model=openrouter.model or "x-ai/grok-4.3",
                timeout=settings.timeout_seconds,
                http=http,
            )
        )
    google = settings.providers["google"]
    if google.enabled:
        configured.append(
            GoogleProvider(
                key_env=google.key_env,
                model=google.model or "gemini-2.5-pro",
                timeout=settings.timeout_seconds,
                http=http,
            )
        )
    return configured
