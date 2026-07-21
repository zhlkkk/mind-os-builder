import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { Ajv } from "ajv";

const root = process.cwd();

test("Tech Research Skill 按能力编排并在无工具时停止", async () => {
  const skill = await readFile(join(root, ".agents/skills/tech-research/SKILL.md"), "utf8");
  const transcript = JSON.parse(await readFile(join(root, "tests/fixtures/research/tool-transcript.json"), "utf8")) as { cases: Array<{ name: string; expected: string }> };
  for (const phrase of ["quick", "standard", "deep", "能力探测", "没有可用", "证据缺口", "反方审视", "交叉核验", "mindos research commit"]) assert.match(skill, new RegExp(phrase));
  assert.deepEqual(transcript.cases.map((item) => item.name), ["single-tool", "complementary-tools", "no-tool", "partial-failure"]);
  assert.equal(transcript.cases.find((item) => item.name === "no-tool")?.expected, "stop-without-report");
});

test("候选 frontmatter 契约要求工具与来源", async () => {
  const schema = JSON.parse(await readFile(join(root, "contracts/research-report.schema.json"), "utf8")) as object;
  const validate = new Ajv({ allErrors: true }); validate.addFormat("uri", (value: string) => /^https?:\/\//u.test(value)); const check = validate.compile(schema);
  const valid = { version: "v1", topic: "合成技术", mode: "standard", researched_at: "2026-07-21", evidence_status: "complete", tools: ["web-search"], sources: ["https://example.com/docs"] };
  assert.equal(check(valid), true, JSON.stringify(check.errors));
  assert.equal(check({ ...valid, tools: [] }), false);
  assert.equal(check({ ...valid, sources: [] }), false);
  assert.equal(check({ ...valid, provider_key: "secret" }), false);
});

test("核心 TypeScript 不包含研究 Provider Runtime 或凭证读取", async () => {
  const files = ["src/commands/research.ts", "src/research/validate.ts", "src/research/commit.ts"];
  const source = (await Promise.all(files.map((path) => readFile(join(root, path), "utf8")))).join("\n").toLowerCase();
  for (const forbidden of ["tavily_api_key", "exa_api_key", "perplexity_api_key", "openrouter_key", "google_ai_key", "api.tavily", "api.exa", "api.perplexity", "openrouter.ai", "generativelanguage.googleapis"]) assert.equal(source.includes(forbidden), false, forbidden);
});
