from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path
from typing import TYPE_CHECKING, Any

from mind_os_builder.core.capabilities import ACTION_REGISTRY
from mind_os_builder.mcp.resources import ResourceCatalog
from mind_os_builder.mcp.tools import ActionDispatcher, ActionTools, AdapterSecurityError

if TYPE_CHECKING:
    from mcp.server.fastmcp import FastMCP


def _tool_handler(
    action: str, tools: ActionTools
) -> Callable[[dict[str, Any] | None, bool], dict[str, Any]]:
    def invoke(parameters: dict[str, Any] | None = None, apply: bool = False) -> dict[str, Any]:
        """通过共享应用服务执行一个版本化 Action；写操作默认仅预演。"""

        return tools.call(action, parameters=parameters, apply=apply)

    return invoke


def create_server(
    *,
    vault_root: Path | None,
    dispatcher: ActionDispatcher,
    transport: str = "stdio",
    jobs: Mapping[str, Any] | None = None,
    run_summary: Mapping[str, Any] | None = None,
) -> FastMCP:
    """创建仅限本地 stdio 的 MCP v1 Server。"""

    if transport != "stdio":
        raise AdapterSecurityError("MCP v1 仅支持本地 stdio transport")
    if vault_root is None:
        raise ValueError("必须在启动时声明 vault root")

    from mcp.server.fastmcp import FastMCP

    tools = ActionTools(vault_root=vault_root, dispatcher=dispatcher, local_transport=True)
    catalog = ResourceCatalog(vault_root=tools.vault_root, jobs=jobs, run_summary=run_summary)
    server = FastMCP(name="Mind OS Builder", log_level="WARNING")

    for action, spec in ACTION_REGISTRY.items():
        server.add_tool(
            _tool_handler(action, tools),
            name=action.replace(".", "_"),
            description=spec.description,
            structured_output=True,
        )

    for uri in (
        "mindos://capabilities",
        "mindos://jobs",
        "mindos://schemas/config",
        "mindos://runs/latest",
    ):
        server.resource(uri, mime_type="application/json")(
            _resource_handler(uri, catalog)
        )
    return server


def _resource_handler(uri: str, catalog: ResourceCatalog) -> Callable[[], str]:
    def read() -> str:
        return catalog.read(uri)

    return read
