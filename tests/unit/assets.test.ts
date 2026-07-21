import assert from "node:assert/strict";
import { basename } from "node:path";
import test from "node:test";
import { assetPath, packageRoot } from "../../src/lib/assets.js";
import { MindosError } from "../../src/lib/paths.js";

test("资产解析只暴露规范目录", () => {
  assert.equal(basename(packageRoot()), "mind-os-builder");
  assert.match(assetPath("contracts"), /contracts$/u);
  assert.throws(
    () => assetPath("private"),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.input.invalid",
  );
});
