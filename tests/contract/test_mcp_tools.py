from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Mapping

import pytest

from mind_os_builder.application.dispatcher import dispatch_action
from mind_os_builder.cli.main import main
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


def test_mcp_research_config_cannot_escape_vault_with_parent_path(
    tmp_path: Path,
) -> None:
    vault = tmp_path / "vault"
    tools = ActionTools(vault_root=vault, dispatcher=_dispatcher)

    with pytest.raises(AdapterSecurityError, match="vault"):
        tools.call(
            "research.run",
            parameters={"topic": "MCP", "config": "../outside.yaml"},
        )


def test_mcp_research_config_cannot_use_absolute_path_outside_vault(
    tmp_path: Path,
) -> None:
    vault = tmp_path / "vault"
    tools = ActionTools(vault_root=vault, dispatcher=_dispatcher)

    with pytest.raises(AdapterSecurityError, match="vault"):
        tools.call(
            "research.run",
            parameters={"topic": "MCP", "config": str(tmp_path / "outside.yaml")},
        )


def test_mcp_research_config_resolves_relative_to_vault(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    tools = ActionTools(vault_root=vault, dispatcher=_dispatcher)

    payload = tools.call(
        "research.run",
        parameters={"topic": "MCP", "config": ".mindos/config.yaml"},
    )

    assert payload["metrics"]["parameters"]["config"] == str(
        (vault / ".mindos/config.yaml").resolve()
    )


def test_remote_mode_cannot_apply_writes(tmp_path: Path) -> None:
    tools = ActionTools(vault_root=tmp_path, dispatcher=_dispatcher, local_transport=False)
    with pytest.raises(AdapterSecurityError, match="远程"):
        tools.call("wiki.init", parameters={}, apply=True)
    with pytest.raises(AdapterSecurityError, match="远程"):
        tools.call(
            "wiki.ingest",
            parameters={"path": "wiki/concepts/test.md", "content": "candidate"},
            apply=True,
        )
    with pytest.raises(AdapterSecurityError, match="vault"):
        tools.call(
            "collect.twitter",
            parameters={"provider": "fixture", "fixture_path": tmp_path.parent / "input.json"},
        )


def test_cli_and_local_mcp_accept_the_same_external_fixture(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    pytest.importorskip("mcp")
    vault = tmp_path / "vault"
    fixture = tmp_path / "inputs" / "twitter.json"
    fixture.parent.mkdir()
    fixture.write_text(
        json.dumps(
            {
                "records": [
                    {
                        "id": "contract-1",
                        "title": "Agent CLI",
                        "text": "包含源码和基准测试。",
                        "url": "https://example.invalid/contract-1",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    assert main(["wiki", "init", str(vault), "--apply", "--json"]) == 0
    capsys.readouterr()

    cli_parameters = [
        "collect",
        "twitter",
        str(vault),
        "--fixture",
        str(fixture),
        "--json",
    ]
    assert main(cli_parameters) == 0
    cli_result = json.loads(capsys.readouterr().out)

    server = create_server(vault_root=vault, dispatcher=dispatch_action)
    mcp_result = asyncio.run(
        server.call_tool(
            "collect_twitter",
            {
                "parameters": {
                    "provider": "fixture",
                    "fixture_path": str(fixture),
                    "output": "raw/twitter/twitter-brief.md",
                }
            },
        )
    )
    assert isinstance(mcp_result, tuple)
    _, structured = mcp_result

    for key in ("task", "status", "reason_code", "changed", "artifacts", "metrics"):
        assert structured[key] == cli_result[key]


def test_external_fixture_does_not_relax_write_boundaries(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    fixture = tmp_path / "twitter.json"
    fixture.write_text('{"records": []}', encoding="utf-8")
    dispatch_action("wiki.init", vault, {}, True)
    tools = ActionTools(vault_root=vault, dispatcher=dispatch_action)

    result = tools.call(
        "collect.twitter",
        parameters={
            "provider": "fixture",
            "fixture_path": str(fixture),
            "output": "../outside.md",
        },
        apply=True,
    )

    assert result["status"] == "failed"
    assert result["reason_code"] == "promotion_failed"
    assert not (tmp_path / "outside.md").exists()


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


def test_mcp_radar_path_violation_is_structured_and_sanitized(tmp_path: Path) -> None:
    secret_name = "private-radar-secret.md"
    tools = ActionTools(vault_root=tmp_path, dispatcher=dispatch_action)

    payload = tools.call(
        "radar.review",
        parameters={"pages": [f"../{secret_name}"], "today": "2026-01-15"},
    )

    assert payload["status"] == "blocked"
    assert payload["reason_code"] == "path_violation"
    assert secret_name not in str(payload)
