from __future__ import annotations

import os

import pytest

from mind_os_builder.collect.providers.twitter_opencli import TwitterOpenCliProvider

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        os.environ.get("MINDOS_RUN_LIVE") != "1",
        reason="设置 MINDOS_RUN_LIVE=1 后才运行真实 Provider 烟测",
    ),
]


def test_live_twitter_provider_returns_contract_shape() -> None:
    batch = TwitterOpenCliProvider().fetch()

    assert isinstance(batch.records, tuple)
