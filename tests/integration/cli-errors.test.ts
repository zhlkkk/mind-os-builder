import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const cli = join(process.cwd(), "lib", "src", "cli.js");

test("命令解析错误只返回 v1 JSON", () => {
  for (const arguments_ of [["unknown"], ["wiki", "init"]]) {
    const completed = spawnSync(process.execPath, [cli, ...arguments_], { encoding: "utf8" });
    assert.equal(completed.status, 1);
    assert.equal(completed.stderr, "");
    const result = JSON.parse(completed.stdout) as { version: string; state: string; error: { code: string } };
    assert.deepEqual(
      { version: result.version, state: result.state, code: result.error.code },
      { version: "v1", state: "blocked", code: "mindos.input.invalid" },
    );
  }
});

test("帮助和版本保持人类可读且成功退出", () => {
  for (const argument of ["--help", "--version"]) {
    const completed = spawnSync(process.execPath, [cli, argument], { encoding: "utf8" });
    assert.equal(completed.status, 0);
    assert.equal(completed.stderr, "");
    assert.match(completed.stdout, /mindos|0\.1\.0/u);
  }
});
