from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from mind_os_builder.core.results import RunEnvelope, RunStatus
from mind_os_builder.mcp.resources import ResourceCatalog
from mind_os_builder.mcp.server import create_server
from mind_os_builder.mcp.tools import ActionTools, AdapterSecurityError


def _dispatcher(
    action: str,
    vault_root: Path,
    parameters: Mapping[str, Any],
    apply: bool,
) -> RunEnvelope:
    return RunEnvelope(
        task=action,
        status=RunStatus.SUCCEEDED,
        changed=apply,
        artifacts=[str(vault_root / "wiki" / "index.md")] if apply else [],
        metrics={"parameters": dict(parameters), "apply": apply},
    )


def test_tools_require_a_fixed_vault_root() -> None:
    with pytest.raises(ValueError, match="vault root"):
        ActionTools(vault_root=None, dispatcher=_dispatcher)


def test_write_actions_default_to_dry_run(tmp_path: Path) -> None:
    tools = ActionTools(vault_root=tmp_path, dispatcher=_dispatcher)
    payload = tools.call("wiki.init", parameters={})
    assert payload["changed"] is False
    assert payload["metrics"] == {"parameters": {}, "apply": False}


@pytest.mark.parametrize(
    "parameters",
    [
        {"path": "../outside.md"},
        {"target_path": "/tmp/outside.md"},
        {"nested": {"file_path": "../../secret"}},
        {"vault_root": "different-root"},
    ],
)
def test_tool_parameters_cannot_escape_fixed_root(
    tmp_path: Path, parameters: dict[str, object]
) -> None:
    tools = ActionTools(vault_root=tmp_path, dispatcher=_dispatcher)
    with pytest.raises(AdapterSecurityError, match="vault"):
        tools.call("wiki.lint", parameters=parameters)


def test_remote_mode_cannot_apply_writes(tmp_path: Path) -> None:
    tools = ActionTools(vault_root=tmp_path, dispatcher=_dispatcher, local_transport=False)
    with pytest.raises(AdapterSecurityError, match="远程"):
        tools.call("wiki.init", parameters={}, apply=True)


def test_resources_are_read_only_json_documents(tmp_path: Path) -> None:
    catalog = ResourceCatalog(vault_root=tmp_path, run_summary={"status": "succeeded"})
    capabilities = json.loads(catalog.read("mindos://capabilities"))
    schema = json.loads(catalog.read("mindos://schemas/config"))
    summary = json.loads(catalog.read("mindos://runs/latest"))
    assert capabilities["api_version"] == "v1"
    assert schema["api_version"] == "v1"
    assert summary == {"status": "succeeded"}


def test_fastmcp_registers_action_tools_without_stdout_noise(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    pytest.importorskip("mcp")
    server = create_server(vault_root=tmp_path, dispatcher=_dispatcher)
    result = asyncio.run(server.call_tool("wiki_lint", {"parameters": {}}))
    assert isinstance(result, tuple)
    _, structured = result
    assert structured["task"] == "wiki.lint"
    assert capsys.readouterr().out == ""


def test_server_rejects_non_stdio_transport(tmp_path: Path) -> None:
    pytest.importorskip("mcp")
    with pytest.raises(AdapterSecurityError, match="stdio"):
        create_server(
            vault_root=tmp_path,
            dispatcher=_dispatcher,
            transport="streamable-http",
        )
