import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MindosError } from "../lib/paths.js";
import type { CliResult } from "../lib/result.js";

const cli = fileURLToPath(new URL("../cli.js", import.meta.url));
export const MCP_TOOL_NAMES = { lint: "mindos_wiki_lint", query: "mindos_wiki_query", books: "mindos_books_validate", init: "mindos_wiki_init" } as const;

async function invoke(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let bytes = 0;
    child.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 1024 * 1024) child.kill(); else stdout += chunk.toString(); });
    child.stderr.resume(); child.on("error", () => reject(new MindosError("mindos.filesystem.failed", "MCP command could not start")));
    child.on("close", () => {
      try {
        const value = JSON.parse(stdout) as CliResult;
        if (value.version !== "v1" || typeof value.ok !== "boolean" || typeof value.state !== "string") throw new Error();
        resolve(value);
      } catch { reject(new MindosError("mindos.filesystem.failed", "MCP command returned an invalid result")); }
    });
  });
}

const output = (result: CliResult) => ({
  content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result as unknown as Record<string, unknown>, isError: !result.ok,
});

export async function serveMcp(vault: string): Promise<void> {
  let root: string;
  try { root = await realpath(vault); if (!(await stat(root)).isDirectory()) throw new Error(); }
  catch { throw new MindosError("mindos.filesystem.invalid_root", "MCP vault root must be an existing directory"); }
  let modules;
  try {
    modules = await Promise.all([import("@modelcontextprotocol/sdk/server/mcp.js"), import("@modelcontextprotocol/sdk/server/stdio.js"), import("zod")]);
  } catch { throw new MindosError("mindos.dependency.unavailable", "optional MCP dependency is not installed; reinstall without omitting optional dependencies"); }
  const [{ McpServer }, { StdioServerTransport }, z] = modules; const server = new McpServer({ name: "mind-os-builder", version: "0.1.0" });
  server.registerTool(MCP_TOOL_NAMES.lint, { description: "检查固定 vault 的 Wiki，不修改文件。" }, async () => output(await invoke(["wiki", "lint", root, "--json"])));
  server.registerTool(MCP_TOOL_NAMES.query, { description: "查询固定 vault 的已编译 Wiki。", inputSchema: { query: z.string().min(1).max(500), limit: z.number().int().min(1).max(50).default(10) } },
    async ({ query, limit }) => output(await invoke(["wiki", "query", root, query, "--limit", String(limit), "--json"])));
  server.registerTool(MCP_TOOL_NAMES.books, { description: "校验固定 vault 的 Book Base。" }, async () => output(await invoke(["books", "validate", root, "--json"])));
  server.registerTool(MCP_TOOL_NAMES.init, { description: "预演或显式初始化固定 vault。", inputSchema: { apply: z.boolean().default(false) } },
    async ({ apply }) => output(await invoke(["wiki", "init", root, ...(apply ? ["--apply"] : []), "--json"])));
  await server.connect(new StdioServerTransport());
}
