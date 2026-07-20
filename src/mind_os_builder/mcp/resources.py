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
        if uri == "mindos://capabilities":
            payload: object = capability_manifest()
        elif uri == "mindos://jobs":
            payload = self._jobs
        elif uri == "mindos://schemas/config":
            payload = self._config_schema()
        elif uri == "mindos://runs/latest":
            payload = self._run_summary
        else:
            raise ValueError(f"未知 MCP resource：{uri}")
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
