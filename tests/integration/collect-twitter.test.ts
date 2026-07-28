import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cli = join(process.cwd(), "lib/src/cli.js");
type Result = { ok: boolean; state: string; data: Record<string, unknown>; error?: { code: string } };
const run = (args: string[], env = process.env): Result => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env });
  assert.equal(result.stderr, ""); assert.notEqual(result.stdout, ""); return JSON.parse(result.stdout) as Result;
};
const decision = (batch: Result) => ({
  version: "v1", batch_id: batch.data.batch_id, baseline_hash: batch.data.baseline_hash,
  decisions: [{ id: "one", decision: "keep", reason: "一手实现", display_title: "Agent 基准", display_summary: "公开了测试方法与结果。", translated: true, category: "agent-systems", tags: ["agent"] }],
});

test("Twitter 完成 prepare、校验、preview、apply 与 replay", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); const other = join(root, "other"); await mkdir(bin);
  const executable = join(bin, "opencli"); const invocations = join(root, "opencli-invocations.log"); await writeFile(invocations, "");
  await writeFile(executable, `#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.OPENCLI_INVOCATIONS,JSON.stringify(process.argv.slice(2))+"\\n");process.stdout.write(JSON.stringify({records:[{id:"one",title:"Original",text:"details",url:"https://example.test/one",author:"tester"}]}))\n`);
  await chmod(executable, 0o700); const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  env.OPENCLI_INVOCATIONS = invocations;
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  assert.equal(run(["wiki", "init", other, "--apply", "--json"], env).state, "applied");
  const prepared = run(["collect", "twitter", "prepare", vault, "--json"], env); assert.equal(prepared.state, "needs_agent");
  assert.deepEqual((await readFile(invocations, "utf8")).trim().split("\n").map((line): unknown => JSON.parse(line) as unknown), [
    ["twitter", "timeline", "--type", "for-you", "--limit", "50", "--window", "background", "-f", "json"],
    ["twitter", "timeline", "--type", "following", "--limit", "50", "--window", "background", "-f", "json"],
  ]);
  const path = join(root, "decisions.json"); const input = decision(prepared);
  await writeFile(path, JSON.stringify({ ...input, decisions: [{ id: "one", decision: "keep" }] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"], env).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify({ ...input, decisions: [{ ...input.decisions[0], category: "unknown" }] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"], env).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify({ ...input, extra: true })); assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"], env).error?.code, "mindos.input.invalid");
  await writeFile(path, JSON.stringify(input));
  assert.equal(run(["collect", "twitter", "commit", other, path, "--json"], env).error?.code, "mindos.state.batch_missing");
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"], env).state, "preview");
  const applied = run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env); assert.equal(applied.state, "applied");
  const date = new Date().toISOString().slice(0, 10); const daily = await readFile(join(vault, "raw/twitter", `${date}-X精选信息简报.md`), "utf8");
  assert.match(daily, /mindos:collect:twitter:one/u); assert.match(daily, /1\. \*\*Agent 基准\*\*：公开了测试方法与结果。/u);
  assert.match(daily, /— \[@tester\]\(<https:\/\/example\.test\/one>\)/u);
  assert.equal(daily.includes("- 来源："), false); assert.equal(daily.includes("### Agent 基准"), false);
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env).state, "noop");
  const empty = run(["collect", "twitter", "prepare", vault, "--json"], env); assert.equal(empty.data.candidate_count, 0);
  await writeFile(path, JSON.stringify({ version: "v1", batch_id: empty.data.batch_id, baseline_hash: empty.data.baseline_hash, decisions: [] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env).state, "noop");
});

test("Twitter 缺失依赖返回失败且不泄漏 stderr", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-missing-")); context.after(async () => rm(root, { recursive: true, force: true }));
  assert.equal(run(["wiki", "init", join(root, "vault"), "--apply", "--json"]).state, "applied");
  const result = run(["collect", "twitter", "prepare", join(root, "vault"), "--json"], { ...process.env, PATH: root });
  assert.equal(result.state, "failed"); assert.equal(result.error?.code, "mindos.dependency.unavailable");
});

test("Twitter 来源 URL 不能注入第二个 Markdown 资源", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-url-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); await mkdir(bin);
  const executable = join(bin, "opencli");
  const providerUrl = "https://example.test/a b<c>)![tracking](https://tracker.test/pixel";
  await writeFile(executable, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({records:[{id:"one",title:"Original",text:"details",url:${JSON.stringify(providerUrl)},author:"author"}]}))\n`);
  await chmod(executable, 0o700); const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const prepared = run(["collect", "twitter", "prepare", vault, "--json"], env);
  const path = join(root, "decisions.json"); await writeFile(path, JSON.stringify(decision(prepared)));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env).state, "applied");

  const date = new Date().toISOString().slice(0, 10);
  const daily = await readFile(join(vault, "raw/twitter", `${date}-X精选信息简报.md`), "utf8");
  const authorLines = daily.split("\n").filter((line) => line.includes("— [@"));
  assert.deepEqual(authorLines, ["   — [@author](<https://example.test/a%20b%3Cc%3E%29!%5Btracking%5D%28https://tracker.test/pixel>)"]);
  assert.equal(daily.includes("![tracking]"), false);
  assert.equal(daily.match(/\]\(/gu)?.length, 1);
});

test("Twitter 阻止机械保留与无信息短链进入简报", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-quality-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); await mkdir(bin);
  const executable = join(bin, "opencli");
  const records = Array.from({ length: 10 }, (_, index) => ({
    id: `quality-${index}`,
    title: index === 0 ? "https://t.co/AbCdEf1234" : `候选 ${index}`,
    text: index === 0 ? "https://t.co/AbCdEf1234" : `包含可核验细节的候选正文 ${index}`,
    url: `https://x.com/tester/status/${index}`,
    author: "tester",
  }));
  await writeFile(executable, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({records:${JSON.stringify(records)}}))\n`);
  await chmod(executable, 0o700); const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const prepared = run(["collect", "twitter", "prepare", vault, "--json"], env);
  const path = join(root, "decisions.json");
  const candidates = prepared.data.candidates as Array<{ id: string }>;

  await writeFile(path, JSON.stringify({
    version: "v1",
    batch_id: prepared.data.batch_id,
    baseline_hash: prepared.data.baseline_hash,
    decisions: candidates.map((candidate, index) => index === 0
      ? { id: candidate.id, decision: "keep", reason: "值得保留", display_title: "https://t.co/AbCdEf1234", display_summary: "https://t.co/AbCdEf1234", translated: false, category: "agent-systems" }
      : { id: candidate.id, decision: "discard", reason: "与主题无关" }),
  }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"], env).error?.code, "mindos.input.invalid");

  await writeFile(path, JSON.stringify({
    version: "v1",
    batch_id: prepared.data.batch_id,
    baseline_hash: prepared.data.baseline_hash,
    decisions: candidates.map((candidate, index) => ({
      id: candidate.id,
      decision: "keep",
      reason: "符合每日简报主题",
      display_title: `有效标题 ${index}`,
      display_summary: `包含独立摘要和可核验事实 ${index}`,
      translated: false,
      category: "agent-systems",
    })),
  }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"], env).error?.code, "mindos.input.invalid");
});

test("Twitter 只能凭原决策文件撤回已提交托管批次", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-revert-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); await mkdir(bin);
  const executable = join(bin, "opencli");
  await writeFile(executable, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({records:[{id:\"one\",title:\"Original\",text:\"details\",url:\"https://x.com/tester/status/1\",author:\"tester\"}]}))\n");
  await chmod(executable, 0o700); const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const prepared = run(["collect", "twitter", "prepare", vault, "--json"], env);
  const path = join(root, "decisions.json"); await writeFile(path, JSON.stringify(decision(prepared)));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env).state, "applied");

  assert.equal(run(["collect", "twitter", "commit", vault, path, "--revert", "--json"], env).state, "preview");
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--revert", "--apply", "--json"], env).state, "applied");
  const date = new Date().toISOString().slice(0, 10);
  const daily = await readFile(join(vault, "raw/twitter", `${date}-X精选信息简报.md`), "utf8");
  assert.equal(daily.includes("mindos:collect:twitter:one"), false);
  const seen = JSON.parse(await readFile(join(vault, ".mindos/collect/seen.json"), "utf8")) as { twitter?: Record<string, string> };
  assert.equal(seen.twitter?.one, undefined);
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--revert", "--apply", "--json"], env).state, "noop");
  assert.equal(run(["collect", "twitter", "prepare", vault, "--json"], env).data.candidate_count, 1);
});
