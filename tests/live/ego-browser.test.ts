import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("用户 ego-browser 真实 prepare", { skip: process.env.MINDOS_RUN_EGO_LIVE !== "1" }, async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-live-ego-browser-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const runRoot = join(root, "runs");
  const cli = join(process.cwd(), "lib/src/cli.js");
  const script = join(process.cwd(), ".agents/skills/twitter-digest/scripts/collect-ego-browser.sh");
  const workspace = join(process.cwd(), ".agents/skills/twitter-digest/scripts/manage-run-workspace.sh");
  const env = { ...process.env, MINDOS_TWITTER_RUN_ROOT: runRoot };

  await execFileAsync(process.execPath, [cli, "wiki", "init", vault, "--apply", "--json"]);
  const runDir = (await execFileAsync(workspace, ["create", vault], { env })).stdout.trim(); const capture = join(runDir, "capture.json");
  await execFileAsync(script, [capture, runDir.slice(-32)], { env, timeout: 5 * 60_000 });
  await execFileAsync(workspace, ["transition", runDir, vault, "captured"], { env });
  const { stdout } = await execFileAsync(process.execPath, [
    cli, "collect", "twitter", "prepare", vault, "--provider", "ego-browser", "--input", capture, "--json",
  ]);
  const result = JSON.parse(stdout) as { state: string; data: { batch_id: string; candidate_count: number } };
  await execFileAsync(workspace, ["bind", runDir, vault, result.data.batch_id], { env });
  await execFileAsync(workspace, ["cleanup", runDir, vault], { env });
  assert.equal(result.state, "needs_agent");
  assert.equal(result.data.candidate_count > 0, true);
  assert.equal(result.data.candidate_count <= 100, true);
});
