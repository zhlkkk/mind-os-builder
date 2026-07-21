import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile); const cli = join(process.cwd(), "lib/src/cli.js");
type Result = { state: string; data: Record<string, unknown>; error?: { code: string } };
async function run(args: string[]): Promise<Result> {
  try { return JSON.parse((await execFileAsync(process.execPath, [cli, ...args])).stdout) as Result; }
  catch (error: unknown) { return JSON.parse((error as { stdout: string }).stdout) as Result; }
}

test("jobs list/show 只读展示六个声明且没有 run", async () => {
  const listed = await run(["jobs", "list", "--json"]); assert.equal(listed.state, "preview"); assert.equal(listed.data.count, 6);
  const ids = (listed.data.jobs as Array<{ id: string }>).map((item) => item.id); assert.deepEqual(ids, [...ids].sort()); assert.ok(ids.includes("tech-research"));
  const shown = await run(["jobs", "show", "collect-twitter", "--json"]); assert.equal(shown.state, "preview");
  assert.deepEqual((shown.data.job as { command: string[] }).command.slice(0, 4), ["mindos", "collect", "twitter", "prepare"]);
  assert.equal((await run(["jobs", "show", "../bad", "--json"])).error?.code, "mindos.input.invalid");
  assert.equal((await run(["jobs", "run", "lint", "--json"])).error?.code, "mindos.input.invalid");
});
