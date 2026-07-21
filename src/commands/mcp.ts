import type { Command } from "commander";
import { serveMcp } from "../mcp/server.js";

export function registerMcpCommands(program: Command): void {
  program.command("mcp").description("可选本地 MCP stdio 适配")
    .command("serve <vault>").description("固定一个 vault 并启动 stdio Server")
    .action(async (vault: string) => serveMcp(vault));
}
