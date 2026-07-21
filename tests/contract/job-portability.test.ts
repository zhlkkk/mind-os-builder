import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";
import { parse } from "yaml";

type Job = { inputs: Record<string, string>; command?: string[]; skill?: string };
const root = process.cwd();
const bindA = (job: Job, input: Record<string, string>): string[] => (job.command ?? []).map((token) => token.replace(/\{([^}]+)\}/gu, (_, key: string) => input[key] ?? ""));
const bindB = (job: Job, input: Record<string, string>): string[] => structuredClone(job.command ?? []).map((token) => {
  const match = /^\{([^}]+)\}$/u.exec(token); if (match === null) return token;
  const value = input[match[1] ?? ""]; if (value === undefined) throw new Error("missing binding"); return value;
});

test("全部内置 Job 符合 v1 且两个独立宿主得到相同 argv 或 Skill", async () => {
  const schema = JSON.parse(await readFile(join(root, "contracts/job.schema.json"), "utf8")) as object; const validate = new Ajv({ allErrors: true }).compile(schema);
  const files = (await readdir(join(root, "jobs"))).filter((name) => name.endsWith(".yaml")); assert.equal(files.length, 6);
  for (const file of files) {
    const job = parse(await readFile(join(root, "jobs", file), "utf8")) as Job; assert.equal(validate(job), true, `${file}: ${JSON.stringify(validate.errors)}`);
    const input = Object.fromEntries(Object.keys(job.inputs).map((key) => [key, `synthetic-${key}`]));
    if (job.command !== undefined) {
      assert.deepEqual(bindA(job, input), bindB(job, input)); assert.equal(bindA(job, input)[0], "mindos");
      assert.ok(bindA(job, input).every((token) => !/[|;&`]/u.test(token)));
    } else assert.match(job.skill ?? "", /^\.agents\/skills\/[a-z0-9-]+\/SKILL\.md$/u);
  }
});
