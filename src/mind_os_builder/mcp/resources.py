from __future__ import annotations

import json
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from mind_os_builder.core.capabilities import capability_manifest


class ResourceCatalog:
    """提供只读、稳定且不泄露本地根目录的 MCP 资源。"""

    def __init__(
        self,
        *,
        vault_root: Path,
        jobs: Mapping[str, Any] | None = None,
        run_summary: Mapping[str, Any] | None = None,
    ) -> None:
        self._vault_root = vault_root.resolve()
        self._jobs = dict(jobs or {"api_version": "v1", "jobs": []})
        self._run_summary = dict(run_summary or {"status": "unavailable"})

    def read(self, uri: str) -> str:
        documents: dict[str, object] = {
            "mindos://capabilities": capability_manifest(),
            "mindos://jobs": self._jobs,
            "mindos://schemas/config": self._config_schema(),
            "mindos://runs/latest": self._run_summary,
        }
        try:
            payload = documents[uri]
        except KeyError as error:
            raise ValueError(f"未知 MCP resource：{uri}") from error
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)

    @staticmethod
    def _config_schema() -> dict[str, object]:
        return {
            "api_version": "v1",
            "type": "object",
            "properties": {
                "action": {"type": "string"},
                "parameters": {"type": "object"},
                "apply": {"type": "boolean", "default": False},
            },
            "required": ["action"],
            "additionalProperties": False,
        }
