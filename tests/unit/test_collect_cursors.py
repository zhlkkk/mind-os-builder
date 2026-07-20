from __future__ import annotations

import json

from mind_os_builder.collect.cursors import CursorStore


def test_cursor_store_commits_each_provider_without_losing_existing_state(tmp_path) -> None:
    store = CursorStore(tmp_path)

    store.commit("rss", "rss-2")
    store.commit("twitter", "twitter-4")

    assert store.get("rss") == "rss-2"
    assert store.get("twitter") == "twitter-4"
    payload = json.loads((tmp_path / ".mindos/collect/cursors.json").read_text())
    assert payload == {"rss": "rss-2", "twitter": "twitter-4"}


def test_cursor_store_does_not_create_state_when_only_read(tmp_path) -> None:
    store = CursorStore(tmp_path)

    assert store.get("rss") is None
    assert not (tmp_path / ".mindos").exists()
