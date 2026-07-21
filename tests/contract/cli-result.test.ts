import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";

const schemaPath = join(process.cwd(), "contracts", "cli-result.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
const validate = new Ajv({ allErrors: true }).compile(schema);

const result = (state: string, ok: boolean, error?: { code: string; message: string }) => ({
  version: "v1",
  ok,
  state,
  changed: state === "applied",
  artifacts: [],
  data: { source: "synthetic" },
  ...(error === undefined ? {} : { error }),
});

test("接受六种稳定结果状态", () => {
  for (const state of ["preview", "applied", "noop", "needs_agent"]) {
    assert.equal(validate(result(state, true)), true, JSON.stringify(validate.errors));
  }

  for (const state of ["blocked", "failed"]) {
    assert.equal(
      validate(result(state, false, { code: "mindos.validation.invalid_input", message: "合成失败" })),
      true,
      JSON.stringify(validate.errors),
    );
  }
});

test("拒绝不匹配的状态、成功错误和失败缺错", () => {
  const cases = [
    result("unknown", true),
    result("blocked", true),
    { ...result("preview", true), changed: true },
    { ...result("applied", true), changed: false },
    { ...result("failed", false, { code: "mindos.validation.invalid_input", message: "错误" }), changed: true },
    result("preview", false, { code: "mindos.validation.invalid_input", message: "错误" }),
    result("failed", false),
    result("applied", true, { code: "mindos.validation.invalid_input", message: "错误" }),
    { ...result("noop", true), data: undefined },
  ];

  for (const candidate of cases) {
    assert.equal(validate(candidate), false, JSON.stringify(validate.errors));
  }
});
