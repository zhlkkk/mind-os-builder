import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";
import { MCP_TOOL_NAMES } from "../../src/mcp/server.js";

test("MCP 映射固定 v1 命令与结果 schema", async () => {
  const root = process.cwd(); const mapping = parse(await readFile(join(root, "contracts/mcp-tools.yaml"), "utf8")) as { version: string; commands: string; result_schema: string; tools: Array<{ name: string; command: string }> };
  const commands = parse(await readFile(join(root, mapping.commands), "utf8")) as { version: string; commands: Array<{ name: string }> };
  assert.equal(mapping.version, "v1"); assert.equal(commands.version, "v1"); assert.equal(mapping.result_schema, "contracts/cli-result.schema.json");
  const known = new Set(commands.commands.map((item) => item.name)); assert.equal(mapping.tools.length, 4);
  for (const tool of mapping.tools) { assert.match(tool.name, /^mindos_[a-z_]+$/u); assert.ok(known.has(tool.command)); }
  assert.equal(new Set(mapping.tools.map((item) => item.name)).size, mapping.tools.length);
  assert.deepEqual(mapping.tools.map((item) => item.name).sort(), Object.values(MCP_TOOL_NAMES).sort());
});
