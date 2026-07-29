import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cli = join(process.cwd(), "lib/src/cli.js");
const run = (args: string[], env: NodeJS.ProcessEnv): { state: string; data: Record<string, unknown> } => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env }); assert.equal(result.stderr, ""); return JSON.parse(result.stdout) as { state: string; data: Record<string, unknown> };
};

test("RSS 只通过 Folo CLI 使用同一两阶段契约", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-rss-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); await mkdir(bin);
  const executable = join(bin, "folo"); const invocations = join(root, "folo-invocations.log"); await writeFile(invocations, "");
  await writeFile(executable, `#!/usr/bin/env node\nconst fs=require("node:fs");const args=process.argv.slice(2);fs.appendFileSync(process.env.FOLO_INVOCATIONS,JSON.stringify(args)+"\\n");const timeline=["timeline","--view","articles","--limit","50","-f","json"];if(JSON.stringify(args)===JSON.stringify(timeline)){process.stdout.write(JSON.stringify({ok:true,data:{entries:[{feeds:{title:"Example Feed"},entries:{id:"feed-one",title:"",summary:"source details",description:"fallback title",url:"https://example.test/feed-one",author:"Article Author"}}],nextCursor:"rss-next"},error:null}));}else if(JSON.stringify(args)===JSON.stringify(["entry","mark-read","feed-one"])){process.stdout.write("{}");}else process.exit(2);\n`); await chmod(executable, 0o700);
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, FOLO_INVOCATIONS: invocations };
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const configPath = join(vault, ".mindos/config.yaml"); const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace("mark_read_after_commit: false", "mark_read_after_commit: true"));
  const batch = run(["collect", "rss", "prepare", vault, "--json"], env); assert.equal(batch.state, "needs_agent");
  assert.equal(batch.data.candidate_count, 1);
  const candidates = batch.data.candidates as Array<{ title: string }>;
  assert.equal(candidates[0]!.title, "source details");
  const decisions = join(root, "rss.json"); await writeFile(decisions, JSON.stringify({ version: "v1", batch_id: batch.data.batch_id, baseline_hash: batch.data.baseline_hash, decisions: [{ id: "feed-one", decision: "keep", reason: "有来源", display_title: "版本发布", display_summary: "发布了实现细节。", translated: false, category: "developer-tools" }] }));
  assert.equal(run(["collect", "rss", "commit", vault, decisions, "--json"], env).state, "preview");
  assert.deepEqual((await readFile(invocations, "utf8")).trim().split("\n").map((line): unknown => JSON.parse(line) as unknown), [
    ["timeline", "--view", "articles", "--limit", "50", "-f", "json"],
  ]);
  const applied = run(["collect", "rss", "commit", vault, decisions, "--apply", "--json"], env); assert.equal(applied.state, "applied");
  assert.equal(applied.data.mark_read_count, 1);
  assert.deepEqual((await readFile(invocations, "utf8")).trim().split("\n").map((line): unknown => JSON.parse(line) as unknown), [
    ["timeline", "--view", "articles", "--limit", "50", "-f", "json"],
    ["entry", "mark-read", "feed-one"],
  ]);
  const date = new Date().toISOString().slice(0, 10); const daily = await readFile(join(vault, "raw/rss", `${date}-Folo精选信息简报.md`), "utf8");
  assert.match(daily, /<!-- mindos:collect:rss:feed-one -->\n1\. \*\*版本发布\*\*：发布了实现细节。\n {3}— \[Example Feed\]\(<https:\/\/example\.test\/feed-one>\) · Folo entry `feed-one`/u);
  assert.equal(daily.includes("### 版本发布"), false); assert.equal(daily.includes("- 来源："), false); assert.equal(daily.includes("- 标签："), false);
  const seen = JSON.parse(await readFile(join(vault, ".mindos/collect/seen.json"), "utf8")) as Record<string, unknown>;
  assert.ok(seen.rss); assert.equal(seen.twitter, undefined);
  await assert.rejects(readFile(join(vault, ".mindos/collect/cursors.json"), "utf8"), { code: "ENOENT" });
  assert.equal(run(["collect", "rss", "prepare", vault, "--json"], env).data.candidate_count, 0);
});

test("RSS 已读同步失败后无需决策文件即可恢复并收敛", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-rss-read-retry-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const bin = join(root, "bin"); const vault = join(root, "vault"); await mkdir(bin);
  const executable = join(bin, "folo"); const invocations = join(root, "folo-invocations.log"); const failMarker = join(root, "failed-once");
  await writeFile(invocations, "");
  await writeFile(executable, `#!/usr/bin/env node\nconst fs=require("node:fs");const args=process.argv.slice(2);fs.appendFileSync(process.env.FOLO_INVOCATIONS,JSON.stringify(args)+"\\n");if(args[0]==="timeline"){process.stdout.write(JSON.stringify({ok:true,data:{entries:[{feeds:{title:"Feed"},entries:{id:"one",title:"One",summary:"one",url:"https://example.test/one"}},{feeds:{title:"Feed"},entries:{id:"two",title:"Two",summary:"two",url:"https://example.test/two"}}]},error:null}));}else if(args[0]==="entry"&&args[1]==="mark-read"){if(args[2]==="two"&&!fs.existsSync(process.env.FOLO_FAIL_MARKER)){fs.writeFileSync(process.env.FOLO_FAIL_MARKER,"1");process.exit(9);}process.stdout.write("{}");}else process.exit(2);\n`);
  await chmod(executable, 0o700);
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}`, FOLO_INVOCATIONS: invocations, FOLO_FAIL_MARKER: failMarker };
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const configPath = join(vault, ".mindos/config.yaml"); const config = await readFile(configPath, "utf8");
  await writeFile(configPath, config.replace("mark_read_after_commit: false", "mark_read_after_commit: true"));
  const batch = run(["collect", "rss", "prepare", vault, "--json"], env); const decisions = join(root, "rss.json");
  await writeFile(decisions, JSON.stringify({
    version: "v1",
    batch_id: batch.data.batch_id,
    baseline_hash: batch.data.baseline_hash,
    decisions: [
      { id: "one", decision: "keep", reason: "保留", display_title: "一", display_summary: "摘要", translated: false, category: "developer-tools" },
      { id: "two", decision: "discard", reason: "拒绝" },
    ],
  }));
  assert.equal(run(["collect", "rss", "commit", vault, decisions, "--apply", "--json"], env).state, "failed");
  await rm(decisions);
  const recovery = run(["collect", "rss", "recover", vault, "--json"], env);
  assert.equal(recovery.state, "preview"); assert.equal(recovery.data.pending_count, 1); assert.equal(recovery.data.mark_read_count, 2);
  assert.equal(run(["collect", "rss", "recover", vault, "--apply", "--json"], env).state, "applied");
  assert.equal(run(["collect", "rss", "recover", vault, "--apply", "--json"], env).state, "noop");
  assert.deepEqual((await readFile(invocations, "utf8")).trim().split("\n").map((line): unknown => JSON.parse(line) as unknown), [
    ["timeline", "--view", "articles", "--limit", "50", "-f", "json"],
    ["entry", "mark-read", "one"],
    ["entry", "mark-read", "two"],
    ["entry", "mark-read", "one"],
    ["entry", "mark-read", "two"],
  ]);
});
