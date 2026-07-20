from __future__ import annotations

import os

import pytest

from mind_os_builder.collect.providers.rss_feed import RssFeedProvider

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(
        os.environ.get("MINDOS_RUN_LIVE") != "1",
        reason="设置 MINDOS_RUN_LIVE=1 后才运行真实 Provider 烟测",
    ),
]


def test_live_rss_provider_returns_contract_shape() -> None:
    feed_url = os.environ.get("MINDOS_LIVE_RSS_URL")
    if not feed_url:
        pytest.skip("未设置 MINDOS_LIVE_RSS_URL")

    batch = RssFeedProvider((feed_url,)).fetch()

    assert isinstance(batch.records, tuple)
