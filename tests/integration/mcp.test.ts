import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cli = join(process.cwd(), "lib/src/cli.js"); const execFileAsync = promisify(execFile);
async function direct(args: string[]): Promise<Record<string, unknown>> { return JSON.parse((await execFileAsync(process.execPath, [cli, ...args])).stdout) as Record<string, unknown>; }

test("MCP 固定 vault，逐字段转发 CLI 结果并要求显式 apply", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-mcp-")); context.after(async () => rm(root, { recursive: true, force: true })); const vault = join(root, "vault"); await mkdir(vault);
  const client = new Client({ name: "synthetic-host", version: "1.0.0" }); const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "mcp", "serve", vault] });
  await client.connect(transport); context.after(async () => client.close());
  const listed = await client.listTools(); assert.deepEqual(listed.tools.map((item) => item.name).sort(), ["mindos_books_validate", "mindos_wiki_init", "mindos_wiki_lint", "mindos_wiki_query"]);
  const preview = await client.callTool({ name: "mindos_wiki_init", arguments: { apply: false } }); const previewResult = preview.structuredContent as Record<string, unknown>;
  assert.equal(previewResult.state, "preview"); assert.equal((await direct(["wiki", "init", vault, "--json"])).state, previewResult.state);
  const applied = await client.callTool({ name: "mindos_wiki_init", arguments: { apply: true } }); assert.equal((applied.structuredContent as Record<string, unknown>).state, "applied");
  const mcpLint = (await client.callTool({ name: "mindos_wiki_lint", arguments: {} })).structuredContent as Record<string, unknown>; const cliLint = await direct(["wiki", "lint", vault, "--json"]);
  for (const key of ["version", "ok", "state", "changed", "artifacts", "data"]) assert.deepEqual(mcpLint[key], cliLint[key]);
});
