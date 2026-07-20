from pathlib import Path

import pytest

from mind_os_builder.research.config import load_research_settings


def test_default_settings_restore_existing_provider_contract(tmp_path: Path) -> None:
    settings = load_research_settings(tmp_path)

    assert settings.timeout_seconds == 90
    assert settings.attempts == 3
    assert settings.retry_backoff_seconds == (1.5, 3.0)
    assert settings.tavily_research_wait_seconds == 180
    assert settings.tavily_poll_interval_seconds == 5
    assert settings.providers["tavily-search"].key_env == "TAVILY_API_KEY"
    assert settings.providers["tavily-research"].key_env == "TAVILY_API_KEY"
    assert settings.providers["exa"].key_env == "EXA_API_KEY"
    assert settings.providers["perplexity"].key_env == "PERPLEXITY_API_KEY"
    assert settings.providers["perplexity"].model == "sonar-pro"
    assert settings.providers["perplexity"].deep_model == "sonar-deep-research"
    assert settings.providers["openrouter"].key_env == "OPENROUTER_KEY"
    assert settings.providers["openrouter"].model == "x-ai/grok-4.3"
    assert settings.providers["google"].key_env == "GOOGLE_AI_KEY"
    assert settings.providers["google"].model == "gemini-2.5-pro"


def test_vault_config_overrides_non_secret_provider_settings(tmp_path: Path) -> None:
    config = tmp_path / ".mindos/config.yaml"
    config.parent.mkdir()
    config.write_text(
        """\
version: 1
research:
  timeout_seconds: 45
  providers:
    google:
      enabled: false
    openrouter:
      key_env: MY_OPENROUTER_KEY
      model: x-ai/grok-4.5
""",
        encoding="utf-8",
    )

    settings = load_research_settings(tmp_path)

    assert settings.timeout_seconds == 45
    assert settings.providers["google"].enabled is False
    assert settings.providers["openrouter"].key_env == "MY_OPENROUTER_KEY"
    assert settings.providers["openrouter"].model == "x-ai/grok-4.5"


def test_config_rejects_unknown_provider_and_literal_key_shape(tmp_path: Path) -> None:
    unknown = tmp_path / "unknown.yaml"
    unknown.write_text(
        "version: 1\nresearch:\n  providers:\n    brave:\n      enabled: true\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="brave"):
        load_research_settings(tmp_path, unknown)

    literal = tmp_path / "literal.yaml"
    literal.write_text(
        "version: 1\nresearch:\n  providers:\n    exa:\n      key_env: exa-secret-value\n",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="key_env"):
        load_research_settings(tmp_path, literal)
