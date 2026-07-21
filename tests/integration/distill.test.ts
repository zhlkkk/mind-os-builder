import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const cli = join(process.cwd(), "lib/src/cli.js"); const execFileAsync = promisify(execFile);
type Result = { ok: boolean; state: string; data: Record<string, unknown>; error?: { code: string } };
async function run(args: string[]): Promise<Result> {
  try { return JSON.parse((await execFileAsync(process.execPath, [cli, ...args])).stdout) as Result; }
  catch (error: unknown) { return JSON.parse((error as { stdout: string }).stdout) as Result; }
}
const callouts: Record<string, string> = {
  lumina: "> [!quote] 🌿 Lumina (11:00)\n> 合成的情绪映照。",
  prism: "> [!quote] 🌌 Prism (11:01)\n> 换一个框架看问题。",
  vector: "> [!quote] 🔨 Vector (11:02)\n> - [ ] 完成合成动作。",
  nexus: "> [!info] 🌐 Nexus (11:03)\n> 合成证据结论。",
  ember: "> [!quote] 🔥 Ember (11:04)\n> 重述这个触动点。",
};

test("Distill 扫描五角色并在预演、应用和重放中保持零写入与幂等", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-distill-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const source = "journals/2026-07-21.md"; const journal = join(vault, source); await mkdir(join(vault, "journals"), { recursive: true });
  const original = "感受。 #lumina\n\n创意。 #prism\n\n行动。 #vector\n\n请深度调研。 #nexus\n\n读书触动。 #book/synthetic-book\n";
  await writeFile(journal, original);
  const scanned = await run(["distill", "scan", vault, source, "--json"]); assert.equal(scanned.state, "needs_agent");
  assert.equal(scanned.data.trigger_count, 5); assert.equal(await readFile(journal, "utf8"), original);
  const triggers = scanned.data.triggers as Array<{ trigger_id: string; persona: string; concurrency_key: string; book_slug?: string; mode?: string }>;
  assert.equal(triggers.find((item) => item.persona === "ember")?.book_slug, "synthetic-book");
  assert.equal(triggers.find((item) => item.persona === "nexus")?.mode, "deep"); assert.equal(scanned.data.parallel, true);
  const responsePath = join(root, "responses.json"); const input = {
    version: "v1", baseline_hash: scanned.data.baseline_hash,
    responses: triggers.map((item) => ({ trigger_id: item.trigger_id, persona: item.persona, callout: callouts[item.persona] })),
  };
  await writeFile(responsePath, JSON.stringify(input));
  assert.equal((await run(["distill", "commit", vault, source, responsePath, "--json"])).state, "preview");
  assert.equal(await readFile(journal, "utf8"), original);
  assert.equal((await run(["distill", "commit", vault, source, responsePath, "--apply", "--json"])).state, "applied");
  const applied = await readFile(journal, "utf8"); assert.equal((applied.match(/mindos:distill:/gu) ?? []).length, 5);
  assert.equal((await run(["distill", "commit", vault, source, responsePath, "--apply", "--json"])).state, "noop");
  assert.equal((await run(["distill", "scan", vault, source, "--json"])).state, "noop");
});

test("Distill 拒绝不完整、未知角色、非法 Callout 和过时基线", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-distill-invalid-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const source = "journals/day.md"; const journal = join(vault, source); await mkdir(join(vault, "journals"), { recursive: true });
  await writeFile(journal, "感受。 #lumina\n\n行动。 #vector\n"); const scan = await run(["distill", "scan", vault, source, "--json"]);
  const triggers = scan.data.triggers as Array<{ trigger_id: string; persona: string }>; const path = join(root, "responses.json");
  const base = { version: "v1", baseline_hash: scan.data.baseline_hash, responses: triggers.map((item) => ({ trigger_id: item.trigger_id, persona: item.persona, callout: callouts[item.persona] })) };
  await writeFile(path, JSON.stringify({ ...base, responses: base.responses.slice(0, 1) })); assert.equal((await run(["distill", "commit", vault, source, path, "--json"])).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify({ ...base, responses: [{ ...base.responses[0], persona: "prism", callout: callouts.prism }, base.responses[1]] })); assert.equal((await run(["distill", "commit", vault, source, path, "--json"])).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify({ ...base, responses: [{ ...base.responses[0], callout: "> 非法" }, base.responses[1]] })); assert.equal((await run(["distill", "commit", vault, source, path, "--json"])).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify(base)); await writeFile(journal, "用户改写。 #lumina\n\n行动。 #vector\n");
  assert.equal((await run(["distill", "commit", vault, source, path, "--apply", "--json"])).error?.code, "mindos.state.conflict");
  assert.equal((await run(["distill", "scan", vault, "../outside.md", "--json"])).error?.code, "mindos.filesystem.protected_path");
});

test("Distill 并发提交最多写入一次", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-distill-concurrent-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const source = "journals/day.md"; await mkdir(join(vault, "journals"), { recursive: true }); await writeFile(join(vault, source), "想法。 #prism\n");
  const scan = await run(["distill", "scan", vault, source, "--json"]); const trigger = (scan.data.triggers as Array<{ trigger_id: string; persona: string }>)[0]; const path = join(root, "responses.json");
  await writeFile(path, JSON.stringify({ version: "v1", baseline_hash: scan.data.baseline_hash, responses: [{ trigger_id: trigger?.trigger_id, persona: trigger?.persona, callout: callouts.prism }] }));
  const results = await Promise.all([run(["distill", "commit", vault, source, path, "--apply", "--json"]), run(["distill", "commit", vault, source, path, "--apply", "--json"])]);
  assert.ok(results.some((item) => item.state === "applied")); assert.ok(results.every((item) => ["applied", "noop", "blocked"].includes(item.state)));
  assert.equal((await readFile(join(vault, source), "utf8")).match(/mindos:distill:/gu)?.length, 1);
  assert.equal((await run(["distill", "commit", vault, source, path, "--apply", "--json"])).state, "noop");
});
