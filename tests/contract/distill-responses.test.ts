import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";

const schema = JSON.parse(readFileSync(join(process.cwd(), "contracts/distill-responses.schema.json"), "utf8")) as object;
const validate = new Ajv({ allErrors: true }).compile(schema);
const base = {
  version: "v1",
  baseline_hash: "a".repeat(64),
  responses: [{
    trigger_id: "distill:v1:0123456789abcdef0123",
    persona: "lumina",
    callout: "> [!quote] 🌿 Lumina (10:20)\n> 合成回复。",
  }],
};

test("Distill 回复绑定扫描基线、角色和规范 Callout", () => {
  assert.equal(validate(base), true, JSON.stringify(validate.errors));
  for (const invalid of [
    { ...base, baseline_hash: "short" },
    { ...base, responses: [{ ...base.responses[0], persona: "unknown" }] },
    { ...base, responses: [{ ...base.responses[0], requested_writes: ["wiki/insights/private.md"] }] },
    { ...base, extra: true },
  ]) {
    assert.equal(validate(invalid), false);
  }
});
