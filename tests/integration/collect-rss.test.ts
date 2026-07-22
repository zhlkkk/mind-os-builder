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
  const executable = join(bin, "folo"); await writeFile(executable, `#!/usr/bin/env node\nconst expected=["timeline","--view","articles","--limit","50","-f","json"];if(JSON.stringify(process.argv.slice(2))!==JSON.stringify(expected))process.exit(2);process.stdout.write(JSON.stringify({ok:true,data:{entries:[{feeds:{title:"Example Feed"},entries:{id:"feed-one",title:"Release",summary:"source details",url:"https://example.test/feed-one",author:"Article Author"}}],nextCursor:"rss-next"},error:null}))\n`); await chmod(executable, 0o700);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` }; assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const batch = run(["collect", "rss", "prepare", vault, "--json"], env); assert.equal(batch.state, "needs_agent");
  const decisions = join(root, "rss.json"); await writeFile(decisions, JSON.stringify({ version: "v1", batch_id: batch.data.batch_id, baseline_hash: batch.data.baseline_hash, decisions: [{ id: "feed-one", decision: "keep", reason: "有来源", display_title: "版本发布", display_summary: "发布了实现细节。", translated: false, category: "developer-tools" }] }));
  assert.equal(run(["collect", "rss", "commit", vault, decisions, "--apply", "--json"], env).state, "applied");
  const date = new Date().toISOString().slice(0, 10); const daily = await readFile(join(vault, "raw/rss", `${date}-Folo精选信息简报.md`), "utf8");
  assert.match(daily, /<!-- mindos:collect:rss:feed-one -->\n1\. \*\*版本发布\*\*：发布了实现细节。\n {3}— \[Example Feed\]\(<https:\/\/example\.test\/feed-one>\) · Folo entry `feed-one`/u);
  assert.equal(daily.includes("### 版本发布"), false); assert.equal(daily.includes("- 来源："), false); assert.equal(daily.includes("- 标签："), false);
  const seen = JSON.parse(await readFile(join(vault, ".mindos/collect/seen.json"), "utf8")) as Record<string, unknown>;
  assert.ok(seen.rss); assert.equal(seen.twitter, undefined);
  await assert.rejects(readFile(join(vault, ".mindos/collect/cursors.json"), "utf8"), { code: "ENOENT" });
  assert.equal(run(["collect", "rss", "prepare", vault, "--json"], env).data.candidate_count, 0);
});
