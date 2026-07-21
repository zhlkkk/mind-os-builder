import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

type Workflow = {
  jobs: {
    verify: {
      steps: Array<{
        run?: string;
        uses?: string;
        with?: Record<string, string>;
      }>;
    };
  };
};

const requiredCommands = [
  "npm ci",
  "npm run typecheck",
  "npm run lint",
  "npm test",
  "npm run test:pack",
  "npm run audit:architecture",
  "npm run audit:release",
];

test("CI 使用 Node 24 并执行完整的 npm 校验", async () => {
  const source = await readFile(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
  const workflow = parse(source) as Workflow;
  const steps = workflow.jobs.verify.steps;
  const setupNode = steps.find((step) => step.uses?.startsWith("actions/setup-node@") === true);
  const commands = steps.flatMap((step) => step.run?.split("\n").map((command) => command.trim()).filter(Boolean) ?? []);

  assert.equal(setupNode?.with?.["node-version"], "24");
  for (const command of requiredCommands) {
    assert.ok(commands.includes(command), `CI 缺少命令: ${command}`);
  }
  assert.doesNotMatch(source, /\b(?:python|uv|MINDOS_RUN_LIVE)\b/iu);
});
