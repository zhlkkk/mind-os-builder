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
const currentLocalDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const decision = (batch: Result) => ({
  version: "v1", batch_id: batch.data.batch_id, baseline_hash: batch.data.baseline_hash,
  decisions: [{ id: "one", decision: "keep", reason: "一手实现", display_title: "Agent 基准", display_summary: "公开了测试方法与结果。", translated: true, category: "agent-systems", tags: ["agent"] }],
});

test("Twitter 完成 prepare、校验、preview、apply 与 replay", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); const other = join(root, "other"); await mkdir(bin);
  const executable = join(bin, "opencli"); const invocations = join(root, "opencli-invocations.log"); await writeFile(invocations, "");
  await writeFile(executable, `#!/usr/bin/env node\nrequire("node:fs").appendFileSync(process.env.OPENCLI_INVOCATIONS,JSON.stringify(process.argv.slice(2))+"\\n");process.stdout.write(JSON.stringify({records:[{id:"one",title:"Original",text:"details",url:"https://example.test/one",author:"tester",replies:3,views:4000,retweets:5,likes:20}]}))\n`);
  await chmod(executable, 0o700); const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  env.OPENCLI_INVOCATIONS = invocations;
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  assert.equal(run(["wiki", "init", other, "--apply", "--json"], env).state, "applied");
  const prepared = run(["collect", "twitter", "prepare", vault, "--json"], env); assert.equal(prepared.state, "needs_agent");
  assert.deepEqual(prepared.data.candidates, [{
    id: "one", title: "Original", content: "details", url: "https://example.test/one", author: "tester",
    replies: 3, views: 4_000, retweets: 5, likes: 20,
  }]);
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
  const preview = run(["collect", "twitter", "commit", vault, path, "--json"], env); assert.equal(preview.state, "preview");
  assert.equal((preview.data.quality as { valid?: boolean }).valid, true);
  const applied = run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env); assert.equal(applied.state, "applied");
  const date = currentLocalDate(); const daily = await readFile(join(vault, "raw/twitter", `${date}-X精选信息简报.md`), "utf8");
  assert.match(daily, /mindos:collect:twitter:one/u); assert.match(daily, /1\. \*\*Agent 基准\*\*：公开了测试方法与结果。/u);
  assert.match(daily, /— \[@tester\]\(<https:\/\/example\.test\/one>\)/u);
  assert.match(daily, /互动：评论 3 · 浏览 4000 · 转发 5 · 点赞 20/u);
  assert.equal(daily.includes("- 来源："), false); assert.equal(daily.includes("### Agent 基准"), false);
  const audit = run(["collect", "twitter", "audit", vault, "--date", date, "--json"], env);
  assert.equal(audit.state, "noop"); assert.equal((audit.data.quality as { valid?: boolean }).valid, true);
  const replay = run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env);
  assert.equal(replay.state, "noop"); assert.equal((replay.data.quality as { valid?: boolean }).valid, true);
  const empty = run(["collect", "twitter", "prepare", vault, "--json"], env); assert.equal(empty.data.candidate_count, 0);
  await writeFile(path, JSON.stringify({ version: "v1", batch_id: empty.data.batch_id, baseline_hash: empty.data.baseline_hash, decisions: [] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env).state, "noop");
});

test("Twitter 只读审计报告真实重复 marker 且不修改日报", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-audit-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  const date = "2026-08-10"; const target = join(vault, "raw/twitter", `${date}-X精选信息简报.md`); await mkdir(join(vault, "raw/twitter"), { recursive: true });
  const content = `---\ndate: ${date}\nsource: x.com/home\ntweet_count: 1\nlast_updated: "08:00"\n---\n\n# X/Twitter 每日信息简报 — ${date}\n\n## Agent\n\n<!-- mindos:collect:twitter:123 -->\n1. **发布智能体评测**：团队公开了可复现实验结果。\n   — [@tester](<https://x.com/tester/status/123>)\n\n<!-- mindos:collect:twitter:123 -->\n2. **再次发布智能体评测**：这是同一条托管记录的重复块。\n   — [@tester](<https://x.com/tester/status/123>)\n`;
  await writeFile(target, content);
  const audit = run(["collect", "twitter", "audit", vault, "--date", date, "--json"]);
  assert.equal(audit.state, "blocked"); assert.equal(audit.error?.code, "mindos.state.conflict");
  assert.deepEqual((audit.data.quality as { issues: Array<{ code: string }> }).issues.map((item) => item.code), ["twitter.marker.duplicate"]);
  assert.equal(await readFile(target, "utf8"), content);
});

test("Twitter 只读审计把缺失文件和非法 UTF-8 稳定返回为 blocked", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-audit-input-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  const date = "2026-08-10"; const target = join(vault, "raw/twitter", `${date}-X精选信息简报.md`);
  const missing = run(["collect", "twitter", "audit", vault, "--date", date, "--json"]);
  assert.equal(missing.state, "blocked"); assert.equal(missing.error?.code, "mindos.state.conflict");
  await mkdir(join(vault, "raw/twitter"), { recursive: true }); await writeFile(target, Buffer.from([0xff, 0xfe, 0xfd]));
  const invalid = run(["collect", "twitter", "audit", vault, "--date", date, "--json"]);
  assert.equal(invalid.state, "blocked"); assert.equal(invalid.error?.code, "mindos.state.conflict");
  assert.deepEqual(await readFile(target), Buffer.from([0xff, 0xfe, 0xfd]));
});

test("Twitter 缺失依赖返回失败且不泄漏 stderr", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-missing-")); context.after(async () => rm(root, { recursive: true, force: true }));
  assert.equal(run(["wiki", "init", join(root, "vault"), "--apply", "--json"]).state, "applied");
  const result = run(["collect", "twitter", "prepare", join(root, "vault"), "--json"], { ...process.env, PATH: root });
  assert.equal(result.state, "failed"); assert.equal(result.error?.code, "mindos.dependency.unavailable");
});

test("Twitter 可显式使用 ego-browser 采集文件且默认仍为 OpenCLI", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-ego-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const capture = join(root, "twitter-ego.json");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  await writeFile(capture, JSON.stringify({ records: [{
    id: "ego-one", title: "Browser capture", text: "Captured from the authenticated timeline.",
    url: "https://x.com/tester/status/1", author: "tester", replies: 2, views: 300, retweets: 4, likes: 10,
  }] }));

  const prepared = run(["collect", "twitter", "prepare", vault, "--provider", "ego-browser", "--input", capture, "--json"], { ...process.env, PATH: root });
  assert.equal(prepared.state, "needs_agent");
  assert.equal(prepared.data.candidate_count, 1);
  assert.deepEqual(prepared.data.candidates, [{
    id: "ego-one", title: "Browser capture", content: "Captured from the authenticated timeline.",
    url: "https://x.com/tester/status/1", author: "tester", replies: 2, views: 300, retweets: 4, likes: 10,
  }]);

  const defaultProvider = run(["collect", "twitter", "prepare", vault, "--json"], { ...process.env, PATH: root });
  assert.equal(defaultProvider.state, "failed");
  assert.equal(defaultProvider.error?.code, "mindos.dependency.unavailable");
});

test("Twitter 备用 Provider 用来源 URL 兼容旧无 marker 条目", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-ego-legacy-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const capture = join(root, "capture.json"); const path = join(root, "decisions.json");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  await writeFile(capture, JSON.stringify({ records: [{
    id: "ego-one", title: "Browser capture", text: "Captured from the authenticated timeline.",
    url: "https://x.com/tester/status/1", author: "tester",
  }] }));
  const prepared = run(["collect", "twitter", "prepare", vault, "--provider", "ego-browser", "--input", capture, "--json"]);
  const date = currentLocalDate(); const target = join(vault, "raw/twitter", `${date}-X精选信息简报.md`); await mkdir(join(vault, "raw/twitter"), { recursive: true });
  const legacy = `---\ndate: ${date}\nsource: x.com/home\ntweet_count: 1\nlast_updated: "08:00"\n---\n\n# X/Twitter 每日信息简报 — ${date}\n\n## Agent\n\n1. **人工保留的旧条目**：该条目没有托管 marker。\n   — [@tester](<https://x.com/tester/status/1>)\n`;
  await writeFile(target, legacy);
  await writeFile(path, JSON.stringify({ version: "v1", batch_id: prepared.data.batch_id, baseline_hash: prepared.data.baseline_hash, decisions: [{
    id: "ego-one", decision: "keep", reason: "已由旧条目覆盖", display_title: "浏览器采集条目", display_summary: "该条目已存在于旧版日报中。", translated: true, category: "agent-systems",
  }] }));
  const preview = run(["collect", "twitter", "commit", vault, path, "--json"]);
  assert.equal(preview.state, "preview"); assert.equal((preview.data.quality as { valid?: boolean }).valid, true);
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--apply", "--json"]).state, "applied");
  assert.equal(await readFile(target, "utf8"), legacy);
});

test("Twitter 拒绝不完整或未知的 Provider 参数", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-provider-options-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const capture = join(root, "capture.json");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  await writeFile(capture, JSON.stringify({ records: [] }));

  for (const args of [
    ["collect", "twitter", "prepare", vault, "--provider", "ego-browser", "--json"],
    ["collect", "twitter", "prepare", vault, "--provider", "opencli", "--input", capture, "--json"],
    ["collect", "twitter", "prepare", vault, "--provider", "unknown", "--input", capture, "--json"],
  ]) {
    const result = run(args);
    assert.equal(result.state, "blocked");
    assert.equal(result.error?.code, "mindos.input.invalid");
  }
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

  const date = currentLocalDate();
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

test("Twitter 阻止伪翻译与机械套壳内容进入简报", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-semantic-quality-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const capture = join(root, "capture.json"); const path = join(root, "decisions.json");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  await writeFile(capture, JSON.stringify({ records: [{
    id: "english-one", title: "New agent benchmark", text: "The authors publish reproducible benchmark results.",
    url: "https://x.com/tester/status/42", author: "tester",
  }] }));
  const prepared = run(["collect", "twitter", "prepare", vault, "--provider", "ego-browser", "--input", capture, "--json"]);
  const base = { version: "v1", batch_id: prepared.data.batch_id, baseline_hash: prepared.data.baseline_hash };

  await writeFile(path, JSON.stringify({ ...base, decisions: [{
    id: "english-one", decision: "keep", reason: "包含可复现结果", display_title: "New agent benchmark",
    display_summary: "The authors publish reproducible benchmark results.", translated: true, category: "agent-systems",
  }] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"]).error?.code, "mindos.input.invalid");

  await writeFile(path, JSON.stringify({ ...base, decisions: [{
    id: "english-one", decision: "keep", reason: "包含可复现结果", display_title: "New agent benchmark",
    display_summary: "The authors publish reproducible benchmark results.", translated: false, category: "agent-systems",
  }] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"]).error?.code, "mindos.input.invalid");

  await writeFile(path, JSON.stringify({ ...base, decisions: [{
    id: "english-one", decision: "keep", reason: "包含可复现结果", display_title: "智能体基准发布新结果",
    display_summary: "研究团队公开了可复现的智能体基准结果。", translated: false, category: "agent-systems",
  }] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"]).error?.code, "mindos.input.invalid");

  await writeFile(path, JSON.stringify({ ...base, decisions: [{
    id: "english-one", decision: "keep", reason: "包含可复现结果", display_title: "关于新智能体基准的探讨",
    display_summary: "作者分享了如下内容：研究团队公开了可复现的基准结果。", translated: true, category: "agent-systems",
  }] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"]).error?.code, "mindos.input.invalid");

  await writeFile(path, JSON.stringify({ ...base, decisions: [{
    id: "english-one", decision: "keep", reason: "包含可复现结果", display_title: "智能体基准发布新结果",
    display_summary: "研究团队公开了可复现的智能体基准结果。", translated: true, category: "agent-systems",
  }] }));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--json"]).state, "preview");
});

test("Twitter 只能凭原决策文件撤回已提交托管批次", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-twitter-revert-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); await mkdir(bin);
  const executable = join(bin, "opencli");
  await writeFile(executable, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({records:[{id:\"one\",title:\"Original\",text:\"details\",url:\"https://x.com/tester/status/1\",author:\"tester\",replies:1,views:100,retweets:2,likes:3}]}))\n");
  await chmod(executable, 0o700); const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const prepared = run(["collect", "twitter", "prepare", vault, "--json"], env);
  const path = join(root, "decisions.json"); await writeFile(path, JSON.stringify(decision(prepared)));
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--apply", "--json"], env).state, "applied");
  const date = currentLocalDate();
  assert.match(await readFile(join(vault, "raw/twitter", `${date}-X精选信息简报.md`), "utf8"), /互动：评论 1 · 浏览 100 · 转发 2 · 点赞 3/u);

  assert.equal(run(["collect", "twitter", "commit", vault, path, "--revert", "--json"], env).state, "preview");
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--revert", "--apply", "--json"], env).state, "applied");
  const daily = await readFile(join(vault, "raw/twitter", `${date}-X精选信息简报.md`), "utf8");
  assert.equal(daily.includes("mindos:collect:twitter:one"), false);
  assert.equal(daily.includes("互动："), false);
  const seen = JSON.parse(await readFile(join(vault, ".mindos/collect/seen.json"), "utf8")) as { twitter?: Record<string, string> };
  assert.equal(seen.twitter?.one, undefined);
  assert.equal(run(["collect", "twitter", "commit", vault, path, "--revert", "--apply", "--json"], env).state, "noop");
  assert.equal(run(["collect", "twitter", "prepare", vault, "--json"], env).data.candidate_count, 1);
});
