import os

import pytest

from mind_os_builder.application.dispatcher import dispatch_action


@pytest.mark.live
def test_configured_research_providers_are_reachable(tmp_path) -> None:
    if os.environ.get("MINDOS_RUN_LIVE") != "1":
        pytest.skip("MINDOS_RUN_LIVE is not enabled")
    keys = (
        "TAVILY_API_KEY",
        "EXA_API_KEY",
        "PERPLEXITY_API_KEY",
        "OPENROUTER_KEY",
        "GOOGLE_AI_KEY",
    )
    if not any(os.getenv(name) for name in keys):
        pytest.skip("no Tech Research provider key is configured")

    result = dispatch_action(
        "research.run",
        tmp_path,
        {"topic": "Agent 协议烟测", "mode": "quick", "providers": "auto"},
        False,
    )

    assert result.status.value in {"succeeded", "partial"}
    assert int(result.metrics.get("providers_succeeded", 0)) > 0
