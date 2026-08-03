import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("Twitter Digest Skill 安全清理本次 OpenCLI 空白窗口", async () => {
  const skill = await readFile(join(root, ".agents/skills/twitter-digest/SKILL.md"), "utf8");
  const cleanup = await readFile(join(root, ".agents/skills/twitter-digest/references/opencli-window-cleanup.md"), "utf8");

  assert.match(skill, /OpenCLI 窗口清理/);
  for (const safeguard of [
    "trap cleanup_opencli_window EXIT",
    "beforeIds does not contain currentId",
    "count of tabs of chromeWindow",
    'is "about:blank"',
    "close chromeWindow",
  ]) {
    assert.match(cleanup, new RegExp(safeguard));
  }
  assert.doesNotMatch(cleanup, /quit application/i);
});
