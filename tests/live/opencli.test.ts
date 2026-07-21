import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

test("用户 OpenCLI 真实 prepare", { skip: process.env.MINDOS_RUN_LIVE !== "1" }, async () => {
  const exec = promisify(execFile); const vault = await mkdtemp(join(tmpdir(), "mindos-live-opencli-")); const cli = join(process.cwd(), "lib/src/cli.js"); await exec(process.execPath, [cli, "wiki", "init", vault, "--apply", "--json"]);
  const result = JSON.parse((await exec(process.execPath, [cli, "collect", "twitter", "prepare", vault, "--json"])).stdout) as { state: string }; assert.equal(result.state, "needs_agent");
});
