from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol, runtime_checkable


@dataclass(frozen=True, slots=True)
class ProviderCapability:
    source: str
    network: bool
    experimental: bool


@dataclass(frozen=True, slots=True)
class ProviderBatch:
    records: tuple[Mapping[str, Any], ...]
    next_cursor: str | None = None
    warnings: tuple[str, ...] = ()


@runtime_checkable
class Provider(Protocol):
    name: str

    @property
    def capability(self) -> ProviderCapability: ...

    def fetch(self, cursor: str | None = None) -> ProviderBatch: ...


class ProviderError(RuntimeError):
    """不包含子进程原始输出的稳定 Provider 错误。"""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
