from __future__ import annotations

import os
from collections.abc import Iterable
from typing import Any

from mind_os_builder.research.models import ProviderResult, ProviderStatus


def credential(key_env: str) -> str | None:
    return os.environ.get(key_env)


def skipped_for_key(provider: str, key_env: str) -> ProviderResult:
    return ProviderResult(
        provider,
        ProviderStatus.SKIPPED,
        "",
        error=f"missing_credential:{key_env}",
    )


def failed(provider: str, reason: str, **metadata: object) -> ProviderResult:
    return ProviderResult(
        provider,
        ProviderStatus.FAILED,
        "",
        error=reason,
        metadata=dict(metadata),
    )


def text(value: object) -> str:
    return value if isinstance(value, str) else ""


def object_list(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def unique_urls(values: Iterable[object]) -> list[str]:
    filtered = (
        value
        for value in values
        if isinstance(value, str) and value.startswith(("http://", "https://"))
    )
    return list(dict.fromkeys(filtered))
