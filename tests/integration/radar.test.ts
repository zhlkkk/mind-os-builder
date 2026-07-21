import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { commitRadar } from "../../src/radar/commit.js";
import { prepareRadar } from "../../src/radar/prepare.js";

const cli = join(process.cwd(), "lib/src/cli.js"); const execFileAsync = promisify(execFile);
type Result = { state: string; data: Record<string, unknown>; error?: { code: string } };
async function run(args: string[]): Promise<Result> {
  try { return JSON.parse((await execFileAsync(process.execPath, [cli, ...args])).stdout) as Result; }
  catch (error: unknown) { return JSON.parse((error as { stdout: string }).stdout) as Result; }
}
const page = (body: string): string => `---\ndomain: ai\nsources: 1\ncreated: 2026-01-01\nupdated: 2026-01-01\ntags: [radar]\n---\n# Radar\n${body}\n`;

test("Radar prepare 识别日期边界且只提交批准建议", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-radar-")); context.after(async () => rm(root, { recursive: true, force: true })); const vault = join(root, "vault");
  const relative = "wiki/radar.md"; const target = join(vault, relative); await mkdir(join(vault, "wiki"), { recursive: true });
  const original = page("### 🔴 强信号\n**缺日期**\n- 来源: 07-01 合成\n\n**未来信号**\n- 最新信号: 2026-08-01\n\n**待编译**\n- 最新信号: 2026-07-01\n\n### 🟡 跟踪\n**待降级**\n- 最新信号: 2026-07-01\n\n### 🟢 记录\n**已标记**\n- ⚫ 2026-07-20 建议进入消退归档\n- 最新信号: 2026-06-01");
  await writeFile(target, original);
  const prepared = await run(["radar", "prepare", vault, "--page", relative, "--today", "2026-07-21", "--json"]); assert.equal(prepared.state, "needs_agent");
  assert.equal(prepared.data.suggestion_count, 2); assert.equal(await readFile(target, "utf8"), original);
  assert.deepEqual(new Set((prepared.data.diagnostics as Array<{ status: string }>).map((item) => item.status)), new Set(["missing_date", "future_date", "already_marked"]));
  const repeated = await run(["radar", "prepare", vault, "--page", relative, "--today", "2026-07-21", "--json"]);
  assert.deepEqual((repeated.data.suggestions as Array<{ suggestion_id: string }>).map((item) => item.suggestion_id), (prepared.data.suggestions as Array<{ suggestion_id: string }>).map((item) => item.suggestion_id));
  const suggestions = prepared.data.suggestions as Array<{ suggestion_id: string; title: string }>;
  const decisions = { version: "v1", batch_id: prepared.data.batch_id, baseline_hash: prepared.data.baseline_hash, decisions: suggestions.map((item) => ({ suggestion_id: item.suggestion_id, decision: item.title === "待编译" ? "approve" : "reject" })) };
  const path = join(root, "decisions.json"); await writeFile(path, JSON.stringify({ ...decisions, decisions: decisions.decisions.slice(0, 1) }));
  assert.equal((await run(["radar", "commit", vault, path, "--json"])).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify({ ...decisions, extra: true })); assert.equal((await run(["radar", "commit", vault, path, "--json"])).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify(decisions)); assert.equal((await run(["radar", "commit", vault, path, "--json"])).state, "preview"); assert.equal(await readFile(target, "utf8"), original);
  assert.equal((await run(["radar", "commit", vault, path, "--apply", "--json"])).state, "applied"); const updated = await readFile(target, "utf8");
  assert.match(updated, /建议优先补编译/u); assert.doesNotMatch(updated, /建议降级/u); assert.equal((await run(["radar", "commit", vault, path, "--apply", "--json"])).state, "noop");
});

test("Radar 全拒绝为 noop，并拒绝跨 vault、路径越界和源变化", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-radar-safe-")); context.after(async () => rm(root, { recursive: true, force: true })); const vault = join(root, "vault"); const other = join(root, "other");
  for (const item of [vault, other]) { await mkdir(join(item, "wiki"), { recursive: true }); await writeFile(join(item, "wiki/radar.md"), page("### 🟢 记录\n**旧信号**\n- 最新信号: 2026-01-01")); }
  const prepared = await run(["radar", "prepare", vault, "--page", "wiki/radar.md", "--today", "2026-07-21", "--json"]); const suggestion = (prepared.data.suggestions as Array<{ suggestion_id: string }>)[0];
  const input = { version: "v1", batch_id: prepared.data.batch_id, baseline_hash: prepared.data.baseline_hash, decisions: [{ suggestion_id: suggestion?.suggestion_id, decision: "reject" }] }; const path = join(root, "decisions.json"); await writeFile(path, JSON.stringify(input));
  assert.equal((await run(["radar", "commit", vault, path, "--apply", "--json"])).state, "noop"); assert.equal((await run(["radar", "commit", other, path, "--json"])).error?.code, "mindos.state.batch_missing");
  assert.equal((await run(["radar", "prepare", vault, "--page", "../outside.md", "--json"])).error?.code, "mindos.filesystem.protected_path");
  const fresh = await run(["radar", "prepare", vault, "--page", "wiki/radar.md", "--today", "2026-07-21", "--json"]); const freshSuggestion = (fresh.data.suggestions as Array<{ suggestion_id: string }>)[0];
  await writeFile(path, JSON.stringify({ version: "v1", batch_id: fresh.data.batch_id, baseline_hash: fresh.data.baseline_hash, decisions: [{ suggestion_id: freshSuggestion?.suggestion_id, decision: "approve" }] })); await writeFile(join(vault, "wiki/radar.md"), page("### 🟢 记录\n**用户改写**\n- 最新信号: 2026-01-01"));
  assert.equal((await run(["radar", "commit", vault, path, "--apply", "--json"])).error?.code, "mindos.state.conflict");
});

test("Radar hub 跨目录解析唯一裸链接，并拒绝缺失或重名目标", async (context) => {
  const vault = await mkdtemp(join(tmpdir(), "mindos-radar-hub-")); context.after(async () => rm(vault, { recursive: true, force: true }));
  await mkdir(join(vault, "wiki/concepts"), { recursive: true });
  await writeFile(join(vault, "wiki/index.md"), "# Mind OS\n\n- [[welcome]]\n");
  await writeFile(join(vault, "wiki/concepts/welcome.md"), page("### 🟢 记录\n**欢迎**\n- 最新信号: 2026-01-01"));

  const prepared = await prepareRadar(vault, [], "wiki/index.md", "2026-07-21");
  assert.deepEqual(prepared.batch.pages.map((item) => item.path), ["wiki/concepts/welcome.md"]);

  await writeFile(join(vault, "wiki/index.md"), "# Mind OS\n\n- [[missing]]\n");
  await assert.rejects(prepareRadar(vault, [], "wiki/index.md", "2026-07-21"), (error: unknown) => (error as { code?: string }).code === "mindos.input.invalid");

  await mkdir(join(vault, "wiki/entities"));
  await writeFile(join(vault, "wiki/entities/welcome.md"), page("### 🟢 记录\n**另一个欢迎**\n- 最新信号: 2026-01-01"));
  await writeFile(join(vault, "wiki/index.md"), "# Mind OS\n\n- [[welcome]]\n");
  await assert.rejects(prepareRadar(vault, [], "wiki/index.md", "2026-07-21"), (error: unknown) => (error as { code?: string }).code === "mindos.input.invalid");
});

test("Radar 临时批次过期后要求重新 prepare", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-radar-expired-")); context.after(async () => rm(root, { recursive: true, force: true })); await mkdir(join(root, "wiki")); await writeFile(join(root, "wiki/radar.md"), page("### 🟢 记录\n**旧信号**\n- 最新信号: 2026-01-01"));
  const prepared = await prepareRadar(root, ["wiki/radar.md"], undefined, "2026-07-21", 1); const suggestion = prepared.batch.suggestions[0];
  await assert.rejects(commitRadar(root, { version: "v1", batch_id: prepared.batch.id, baseline_hash: prepared.batch.baseline_hash, decisions: [{ suggestion_id: suggestion?.suggestion_id ?? "", decision: "approve" }] }, false, 86_400_002), (error: unknown) => (error as { code?: string }).code === "mindos.state.batch_expired");
});
