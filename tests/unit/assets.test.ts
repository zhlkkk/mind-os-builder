import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { assetPath, packageRoot, readAssetTree } from "../../src/lib/assets.js";
import { MindosError } from "../../src/lib/paths.js";

test("资产解析只暴露规范目录", () => {
  assert.equal(basename(packageRoot()), "mind-os-builder");
  assert.match(assetPath("contracts"), /contracts$/u);
  assert.throws(
    () => assetPath("private"),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.input.invalid",
  );
});

test("资产递归读取点文件并拒绝符号链接", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-assets-"));
  const outside = await mkdtemp(join(tmpdir(), "mindos-assets-outside-"));
  context.after(async () => Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]));
  await mkdir(join(root, ".hidden"));
  await writeFile(join(root, ".hidden", "nested.txt"), "nested");
  await writeFile(join(root, "visible.txt"), "visible");
  assert.deepEqual((await readAssetTree(root)).map((file) => file.relative), [".hidden/nested.txt", "visible.txt"]);

  await symlink(outside, join(root, "linked"));
  await assert.rejects(
    readAssetTree(root),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.filesystem.symlink",
  );
});
