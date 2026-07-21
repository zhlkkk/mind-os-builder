import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";

const validate = new Ajv({ allErrors: true }).compile(JSON.parse(readFileSync(join(process.cwd(), "contracts/collection-decisions.schema.json"), "utf8")) as object);
const base = { version: "v1", batch_id: "a".repeat(32), baseline_hash: "b".repeat(64) };

test("采集决策要求完整 keep 展示字段与精简 discard", () => {
  assert.equal(validate({ ...base, decisions: [{ id: "one", decision: "keep", reason: "有效", display_title: "标题", display_summary: "摘要", translated: false, category: "custom-category", tags: ["agent"] }, { id: "two", decision: "discard", reason: "重复" }] }), true, JSON.stringify(validate.errors));
  for (const decisions of [
    [{ id: "one", decision: "keep", reason: "缺少展示字段" }],
    [{ id: "one", decision: "discard", reason: "拒绝", display_title: "不允许" }],
    [{ id: "one", decision: "keep", reason: "重复标签", display_title: "标题", display_summary: "摘要", translated: false, category: "other", tags: ["x", "x"] }],
  ]) assert.equal(validate({ ...base, decisions }), false);
});
