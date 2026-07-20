from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.mcp.tools import ActionTools


def test_direct_command_and_mcp_adapter_return_same_domain_result(tmp_path: Path) -> None:
    def command_service(
        action: str,
        vault_root: Path,
        parameters: Mapping[str, Any],
        apply: bool,
    ) -> RunEnvelope:
        return RunEnvelope(
            run_id="stable-fixture-run",
            task=action,
            status=RunStatus.SUCCEEDED,
            changed=apply,
            artifacts=["raw/collect/rss-brief.md"] if apply else [],
            metrics={"accepted": len(parameters.get("items", []))},
        )

    parameters = {"items": ["one", "two"]}
    direct = command_service("collect.rss", tmp_path.resolve(), parameters, True).to_dict()
    through_mcp = ActionTools(vault_root=tmp_path, dispatcher=command_service).call(
        "collect.rss", parameters=parameters, apply=True
    )
    assert through_mcp == direct
