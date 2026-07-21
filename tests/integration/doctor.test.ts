import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("mindos doctor --json 返回 v1 契约且不安装依赖", async () => {
  const cli = join(process.cwd(), "lib", "src", "cli.js");
  const { stdout, stderr } = await execFileAsync(process.execPath, [cli, "doctor", "--json"]);
  assert.equal(stderr, "");
  const result = JSON.parse(stdout) as { version: string; ok: boolean; state: string; changed: boolean; data: { platform: { certified: boolean }; dependencies: Record<string, { available: boolean }> } };
  assert.equal(result.version, "v1");
  assert.equal(result.ok, true);
  assert.equal(result.state, "preview");
  assert.equal(result.changed, false);
  assert.equal(typeof result.data.platform.certified, "boolean");
  assert.deepEqual(Object.keys(result.data.dependencies).sort(), ["folocli", "obsidian", "opencli"]);
});
