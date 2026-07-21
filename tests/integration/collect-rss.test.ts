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
  const executable = join(bin, "folocli"); await writeFile(executable, `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({entries:[{id:"feed-one",title:"Release",summary:"source details",link:"https://example.test/feed-one"}],cursor:"rss-next"}))\n`); await chmod(executable, 0o700);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` }; assert.equal(run(["wiki", "init", vault, "--apply", "--json"], env).state, "applied");
  const batch = run(["collect", "rss", "prepare", vault, "--json"], env); assert.equal(batch.state, "needs_agent");
  const decisions = join(root, "rss.json"); await writeFile(decisions, JSON.stringify({ version: "v1", batch_id: batch.data.batch_id, baseline_hash: batch.data.baseline_hash, decisions: [{ id: "feed-one", decision: "keep", reason: "有来源", display_title: "版本发布", display_summary: "发布了实现细节。", translated: false, category: "developer-tools" }] }));
  assert.equal(run(["collect", "rss", "commit", vault, decisions, "--apply", "--json"], env).state, "applied");
  const date = new Date().toISOString().slice(0, 10); assert.match(await readFile(join(vault, "raw/collect/rss", `${date}.md`), "utf8"), /mindos:collect:rss:feed-one/u);
  const seen = JSON.parse(await readFile(join(vault, ".mindos/collect/seen.json"), "utf8")) as Record<string, unknown>;
  const cursors = JSON.parse(await readFile(join(vault, ".mindos/collect/cursors.json"), "utf8")) as Record<string, unknown>;
  assert.ok(seen.rss); assert.equal(cursors.rss, "rss-next"); assert.equal(seen.twitter, undefined);
});
