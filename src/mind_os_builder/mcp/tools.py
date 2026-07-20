from __future__ import annotations

from collections.abc import Mapping
from pathlib import Path
from typing import Any, Protocol

from mind_os_builder.core.capabilities import ACTION_REGISTRY
from mind_os_builder.core.results import RunEnvelope


class AdapterSecurityError(ValueError):
    """适配器请求突破固定本地边界时抛出。"""


class ActionDispatcher(Protocol):
    """由应用层注入的统一 Action 调度接口。"""

    def __call__(
        self,
        action: str,
        vault_root: Path,
        parameters: Mapping[str, Any],
        apply: bool,
    ) -> RunEnvelope: ...


_PATH_KEYS = {"path", "file", "root", "output_path", "target_path", "source_path"}


class ActionTools:
    """将 MCP 输入收窄后转交共享应用服务，不实现领域规则。"""

    def __init__(
        self,
        *,
        vault_root: Path | None,
        dispatcher: ActionDispatcher,
        local_transport: bool = True,
    ) -> None:
        if vault_root is None:
            raise ValueError("必须在启动时声明 vault root")
        self._vault_root = vault_root.expanduser().resolve()
        self._dispatcher = dispatcher
        self._local_transport = local_transport

    @property
    def vault_root(self) -> Path:
        return self._vault_root

    def call(
        self,
        action: str,
        *,
        parameters: Mapping[str, Any] | None = None,
        apply: bool = False,
    ) -> dict[str, Any]:
        spec = ACTION_REGISTRY.get(action)
        if spec is None:
            raise ValueError(f"未知 Action：{action}")
        if apply and "workspace_write" in spec.effects and not self._local_transport:
            raise AdapterSecurityError("远程适配器不得执行写操作")

        normalized = dict(parameters or {})
        self._validate_parameters(normalized)
        result = self._dispatcher(action, self._vault_root, normalized, apply)
        return result.to_dict()

    def _validate_parameters(self, value: object, *, key: str | None = None) -> None:
        if key == "vault_root":
            raise AdapterSecurityError("vault root 只能在服务启动时固定")
        if isinstance(value, Mapping):
            for child_key, child_value in value.items():
                self._validate_parameters(child_value, key=str(child_key))
            return
        if isinstance(value, list):
            for item in value:
                self._validate_parameters(item, key=key)
            return
        if key is None or not self._is_path_key(key) or not isinstance(value, (str, Path)):
            return

        requested = Path(value).expanduser()
        candidate = requested if requested.is_absolute() else self._vault_root / requested
        resolved = candidate.resolve()
        if not resolved.is_relative_to(self._vault_root):
            raise AdapterSecurityError("请求路径逃逸 vault root")

    @staticmethod
    def _is_path_key(key: str) -> bool:
        return key in _PATH_KEYS or key.endswith("_path") or key.endswith("_file")
