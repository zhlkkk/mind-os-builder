from __future__ import annotations

import re
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any, Mapping

import yaml


_ENV_NAME = re.compile(r"^[A-Z][A-Z0-9_]*$")


@dataclass(frozen=True, slots=True)
class ProviderSettings:
    enabled: bool
    key_env: str
    model: str | None = None
    deep_model: str | None = None


@dataclass(frozen=True, slots=True)
class ResearchSettings:
    timeout_seconds: float
    attempts: int
    retry_backoff_seconds: tuple[float, ...]
    tavily_research_wait_seconds: float
    tavily_poll_interval_seconds: float
    providers: dict[str, ProviderSettings]


def _default_providers() -> dict[str, ProviderSettings]:
    return {
        "tavily-search": ProviderSettings(True, "TAVILY_API_KEY"),
        "tavily-research": ProviderSettings(True, "TAVILY_API_KEY"),
        "exa": ProviderSettings(True, "EXA_API_KEY"),
        "perplexity": ProviderSettings(
            True,
            "PERPLEXITY_API_KEY",
            model="sonar-pro",
            deep_model="sonar-deep-research",
        ),
        "openrouter": ProviderSettings(
            True,
            "OPENROUTER_KEY",
            model="x-ai/grok-4.3",
        ),
        "google": ProviderSettings(
            True,
            "GOOGLE_AI_KEY",
            model="gemini-2.5-pro",
        ),
    }


def default_research_settings() -> ResearchSettings:
    return ResearchSettings(
        timeout_seconds=90,
        attempts=3,
        retry_backoff_seconds=(1.5, 3.0),
        tavily_research_wait_seconds=180,
        tavily_poll_interval_seconds=5,
        providers=_default_providers(),
    )


def _mapping(value: object, name: str) -> Mapping[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, Mapping):
        raise ValueError(f"{name} 必须是对象")
    return {str(key): item for key, item in value.items()}


def _positive_number(value: object, name: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise ValueError(f"{name} 必须是正数")
    return float(value)


def _provider_settings(
    provider_id: str,
    base: ProviderSettings,
    raw: Mapping[str, Any],
) -> ProviderSettings:
    unknown = set(raw) - {"enabled", "key_env", "model", "deep_model"}
    if unknown:
        raise ValueError(f"{provider_id} 包含未知配置：{', '.join(sorted(unknown))}")
    enabled = raw.get("enabled", base.enabled)
    if not isinstance(enabled, bool):
        raise ValueError(f"{provider_id}.enabled 必须是布尔值")
    key_env = str(raw.get("key_env", base.key_env))
    if not _ENV_NAME.fullmatch(key_env):
        raise ValueError(f"{provider_id}.key_env 必须是环境变量名")
    model_value = raw.get("model", base.model)
    deep_model_value = raw.get("deep_model", base.deep_model)
    model = None if model_value is None else str(model_value).strip()
    deep_model = None if deep_model_value is None else str(deep_model_value).strip()
    if model_value is not None and not model:
        raise ValueError(f"{provider_id}.model 不得为空")
    if deep_model_value is not None and not deep_model:
        raise ValueError(f"{provider_id}.deep_model 不得为空")
    return ProviderSettings(enabled, key_env, model, deep_model)


def load_research_settings(
    vault_root: Path,
    config_path: Path | None = None,
) -> ResearchSettings:
    path = config_path or vault_root / ".mindos/config.yaml"
    settings = default_research_settings()
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        if config_path is not None:
            raise ValueError(f"配置文件不存在：{path}")
        return settings
    document = yaml.safe_load(raw)
    root = _mapping(document, "config")
    version = root.get("version", 1)
    if version != 1:
        raise ValueError("config.version 仅支持 1")
    research = _mapping(root.get("research"), "research")
    unknown = set(research) - {
        "timeout_seconds",
        "attempts",
        "retry_backoff_seconds",
        "tavily_research_wait_seconds",
        "tavily_poll_interval_seconds",
        "providers",
    }
    if unknown:
        raise ValueError(f"research 包含未知配置：{', '.join(sorted(unknown))}")
    providers_raw = _mapping(research.get("providers"), "research.providers")
    unknown_providers = set(providers_raw) - set(settings.providers)
    if unknown_providers:
        raise ValueError(f"未知 research provider：{', '.join(sorted(unknown_providers))}")
    providers = dict(settings.providers)
    for provider_id, raw_value in providers_raw.items():
        providers[provider_id] = _provider_settings(
            provider_id,
            providers[provider_id],
            _mapping(raw_value, f"research.providers.{provider_id}"),
        )
    timeout = _positive_number(
        research.get("timeout_seconds", settings.timeout_seconds),
        "research.timeout_seconds",
    )
    attempts = research.get("attempts", settings.attempts)
    if isinstance(attempts, bool) or not isinstance(attempts, int) or not 1 <= attempts <= 5:
        raise ValueError("research.attempts 必须是 1 到 5 的整数")
    backoffs_value = research.get(
        "retry_backoff_seconds",
        list(settings.retry_backoff_seconds),
    )
    if not isinstance(backoffs_value, list):
        raise ValueError("research.retry_backoff_seconds 必须是数组")
    backoffs = tuple(
        _positive_number(item, "research.retry_backoff_seconds") for item in backoffs_value
    )
    if len(backoffs) != max(0, attempts - 1):
        raise ValueError("retry_backoff_seconds 数量必须等于 attempts - 1")
    return replace(
        settings,
        timeout_seconds=timeout,
        attempts=attempts,
        retry_backoff_seconds=backoffs,
        tavily_research_wait_seconds=_positive_number(
            research.get(
                "tavily_research_wait_seconds",
                settings.tavily_research_wait_seconds,
            ),
            "research.tavily_research_wait_seconds",
        ),
        tavily_poll_interval_seconds=_positive_number(
            research.get(
                "tavily_poll_interval_seconds",
                settings.tavily_poll_interval_seconds,
            ),
            "research.tavily_poll_interval_seconds",
        ),
        providers=providers,
    )
