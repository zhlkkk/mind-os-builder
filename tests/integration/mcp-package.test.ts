import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const execFileAsync = promisify(execFile); const root = process.cwd();
async function installPackage(base: string, omitOptional: boolean): Promise<string> {
  const variant = omitOptional ? "core" : "full"; const pack = join(base, `pack-${variant}`); const prefix = join(base, variant); await mkdir(pack); await mkdir(prefix);
  await execFileAsync("npm", ["pack", "--pack-destination", pack], { cwd: root }); const archive = join(pack, (await readdir(pack)).find((name) => name.endsWith(".tgz")) ?? "missing.tgz");
  await execFileAsync("npm", ["install", "--offline", "--ignore-scripts", "--no-package-lock", "--prefix", prefix, ...(omitOptional ? ["--omit=optional"] : []), archive]);
  return join(prefix, "node_modules/.bin/mindos");
}

test("tarball 省略 MCP 时核心可用，默认安装时 MCP 可启动", async (context) => {
  const base = await mkdtemp(join(tmpdir(), "mindos-mcp-package-")); context.after(async () => rm(base, { recursive: true, force: true }));
  const core = await installPackage(base, true); const doctor = JSON.parse((await execFileAsync(core, ["doctor", "--json"])).stdout) as { version: string }; assert.equal(doctor.version, "v1");
  const vault = join(base, "vault"); await mkdir(vault); let missing: string;
  try { await execFileAsync(core, ["mcp", "serve", vault]); throw new Error("expected missing dependency"); }
  catch (error: unknown) { missing = (error as { stdout: string }).stdout; }
  const failure = JSON.parse(missing) as { error: { code: string } }; assert.equal(failure.error.code, "mindos.dependency.unavailable");
  const full = await installPackage(base, false); const client = new Client({ name: "packaged-host", version: "1.0.0" }); const transport = new StdioClientTransport({ command: full, args: ["mcp", "serve", vault] });
  await client.connect(transport); context.after(async () => client.close()); assert.ok((await client.listTools()).tools.some((item) => item.name === "mindos_wiki_init"));
});
