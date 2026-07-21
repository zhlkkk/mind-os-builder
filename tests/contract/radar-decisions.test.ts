import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";

const schema = JSON.parse(readFileSync(join(process.cwd(), "contracts/radar-decisions.schema.json"), "utf8")) as object;
const validate = new Ajv({ allErrors: true }).compile(schema);
const base = {
  version: "v1",
  batch_id: "a".repeat(32),
  baseline_hash: "b".repeat(64),
  decisions: [
    { suggestion_id: "radar:v1:0123456789abcdef0123", decision: "approve" },
    { suggestion_id: "radar:v1:abcdef0123456789abcd", decision: "reject" },
  ],
};

test("Radar 决策要求批次、基线和逐项批准或拒绝", () => {
  assert.equal(validate(base), true, JSON.stringify(validate.errors));
  for (const invalid of [
    { ...base, batch_id: "short" },
    { ...base, baseline_hash: "short" },
    { ...base, decisions: [{ suggestion_id: "radar:v1:0123456789abcdef0123", decision: "adopt" }] },
    { ...base, decisions: [{ ...base.decisions[0], page: "wiki/insights/private.md" }] },
    { ...base, extra: true },
  ]) {
    assert.equal(validate(invalid), false);
  }
});
