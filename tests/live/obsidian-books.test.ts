import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

test("用户 Obsidian vault 的 Book Base 只读校验", { skip: process.env.MINDOS_RUN_LIVE !== "1" || process.env.MINDOS_LIVE_VAULT === undefined }, async () => {
  const result = JSON.parse((await promisify(execFile)(process.execPath, [join(process.cwd(), "lib/src/cli.js"), "books", "validate", process.env.MINDOS_LIVE_VAULT ?? "", "--json"])).stdout) as { ok: boolean }; assert.equal(result.ok, true);
});
