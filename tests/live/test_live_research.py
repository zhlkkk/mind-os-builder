import os

import pytest

from mind_os_builder.research.providers.http_json import HttpJsonProvider


@pytest.mark.live
def test_configured_http_research_provider_is_reachable() -> None:
    endpoint = os.getenv("MINDOS_RESEARCH_ENDPOINT")
    if not endpoint:
        pytest.skip("MINDOS_RESEARCH_ENDPOINT is not configured")
    assert HttpJsonProvider(endpoint=endpoint).name == "http-json"
