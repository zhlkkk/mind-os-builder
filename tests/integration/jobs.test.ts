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

test("jobs export 生成系统调度配置和通用 Agent 任务但不执行", async () => {
  const cron = await run(["jobs", "export", "lint", "--adapter", "cron", "--input", "vault=/tmp/mind-os", "--executable", "/usr/local/bin/mindos", "--json"]);
  assert.equal(cron.state, "preview");
  const cronExport = cron.data.export as { filename: string; content: string };
  assert.equal(cronExport.filename, "lint.cron");
  assert.match(cronExport.content, /^# Mind OS Job: lint\n0 8 \* \* \* '\/usr\/local\/bin\/mindos'/u);

  const launchd = await run(["jobs", "export", "collect-twitter", "--adapter", "launchd", "--input", "vault=/tmp/a&b", "--executable", "/usr/local/bin/mindos", "--json"]);
  assert.equal(launchd.state, "preview");
  const plist = (launchd.data.export as { content: string }).content;
  assert.match(plist, /<key>StartInterval<\/key>/u); assert.match(plist, /<string>\/tmp\/a&amp;b<\/string>/u);

  const agent = await run(["jobs", "export", "distill", "--adapter", "agent", "--input", "vault=/tmp/mind-os", "--input", "source=journals/2026-07-22.md", "--json"]);
  assert.equal(agent.state, "preview");
  const manifest = JSON.parse((agent.data.export as { content: string }).content) as { job: { entry: { skill: string } }; execution: { apply_authorized: boolean } };
  assert.equal(manifest.job.entry.skill, ".agents/skills/distill/SKILL.md"); assert.equal(manifest.execution.apply_authorized, false);
});

test("jobs export 拒绝隐式输入和不可执行的宿主组合", async () => {
  assert.equal((await run(["jobs", "export", "lint", "--adapter", "cron", "--executable", "/usr/local/bin/mindos", "--json"])).error?.code, "mindos.input.invalid");
  assert.equal((await run(["jobs", "export", "lint", "--adapter", "cron", "--input", "vault=/tmp/mind-os", "--executable", "mindos", "--json"])).error?.code, "mindos.input.invalid");
  assert.equal((await run(["jobs", "export", "distill", "--adapter", "cron", "--input", "vault=/tmp/mind-os", "--input", "source=x.md", "--executable", "/usr/local/bin/mindos", "--json"])).error?.code, "mindos.input.invalid");
  assert.equal((await run(["jobs", "export", "distill", "--adapter", "agent", "--input", "vault=/tmp/mind-os", "--input", "source=x.md", "--executable", "/usr/local/bin/mindos", "--json"])).error?.code, "mindos.input.invalid");
  assert.equal((await run(["jobs", "export", "lint", "--adapter", "unknown", "--input", "vault=/tmp/mind-os", "--json"])).error?.code, "mindos.input.invalid");
});
