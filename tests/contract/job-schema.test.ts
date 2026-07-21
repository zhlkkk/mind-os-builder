import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";

const schemaPath = join(process.cwd(), "contracts", "job.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as object;
const validate = new Ajv({ allErrors: true }).compile(schema);

const validCommandJob = {
  version: "v1",
  name: "合成命令任务",
  inputs: { vault: "/tmp/synthetic-vault" },
  command: ["mindos", "wiki", "init", "--vault", "{vault}"],
  effects: ["workspace.write"],
  concurrency: "single",
  retry: { max_attempts: 0 },
};

const validSkillJob = {
  version: "v1",
  name: "合成技能任务",
  inputs: { topic: "synthetic" },
  skill: ".agents/skills/tech-research/SKILL.md",
  effects: ["network.read"],
  concurrency: "single",
  retry: { max_attempts: 1 },
};

const assertBindingsKnown = (job: { inputs: Record<string, string>; command?: string[] }) => {
  for (const token of job.command ?? []) {
    for (const binding of token.matchAll(/\{([^}]+)\}/g)) {
      assert.ok(Object.hasOwn(job.inputs, binding[1] ?? ""), `未知输入绑定: ${binding[1]}`);
    }
  }
};

test("接受命令或技能两种声明式任务", () => {
  assert.equal(validate(validCommandJob), true, JSON.stringify(validate.errors));
  assertBindingsKnown(validCommandJob);
  assert.equal(validate(validSkillJob), true, JSON.stringify(validate.errors));
});

test("拒绝 shell、管道、双绑定、未知绑定和缺少副作用", () => {
  const invalidJobs = [
    { ...validCommandJob, command: ["sh", "-c", "echo synthetic"] },
    { ...validCommandJob, command: ["mindos", "wiki", "init", "|", "tee", "out"] },
    { ...validCommandJob, skill: ".agents/skills/wiki/SKILL.md" },
    { ...validCommandJob, command: ["mindos", "wiki", "init", "--vault", "{missing}"] },
    { ...validCommandJob, effects: [] },
  ];

  for (const job of invalidJobs) {
    if (validate(job)) {
      assert.throws(() => assertBindingsKnown(job));
    } else {
      assert.equal(validate(job), false, JSON.stringify(validate.errors));
    }
  }
});
