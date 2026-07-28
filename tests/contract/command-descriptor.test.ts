import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

type BaseCommandDescriptor = {
  name: string;
  input_schema?: string;
  effects: string[];
  agent_next_step: string;
  stable_errors: string[];
};

type CommandDescriptor = BaseCommandDescriptor & {
  result_schema?: string;
  transport?: "mcp-stdio";
};

const descriptorPath = join(process.cwd(), "contracts", "commands.yaml");
const descriptor = parse(readFileSync(descriptorPath, "utf8")) as { version: string; commands: CommandDescriptor[] };

test("命令描述符发布分阶段命令和代理下一步", () => {
  assert.equal(descriptor.version, "v1");
  assert.deepEqual(
    descriptor.commands.map((command) => command.name),
    [
      "doctor",
      "skills.install",
      "wiki.init",
      "wiki.lint",
      "wiki.ingest",
      "wiki.query",
      "books.init",
      "books.validate",
      "collect.twitter.prepare",
      "collect.twitter.commit",
      "collect.rss.prepare",
      "collect.rss.commit",
      "distill.scan",
      "distill.commit",
      "radar.prepare",
      "radar.commit",
      "research.commit",
      "jobs.list",
      "jobs.show",
      "jobs.export",
      "mcp.serve",
    ],
  );

  for (const command of descriptor.commands) {
    if (command.transport === "mcp-stdio") {
      assert.equal(command.name, "mcp.serve");
      assert.equal(Object.hasOwn(command, "result_schema"), false);
    } else {
      assert.equal(command.transport, undefined);
      assert.match(command.result_schema ?? "", /^contracts\/.+\.schema\.json$/);
      assert.equal(existsSync(join(process.cwd(), command.result_schema ?? "")), true, `缺少契约: ${command.result_schema}`);
    }
    if (command.input_schema !== undefined) {
      assert.match(command.input_schema, /^contracts\/.+\.schema\.json$/);
      assert.equal(existsSync(join(process.cwd(), command.input_schema)), true, `缺少契约: ${command.input_schema}`);
    }
    assert.ok(command.effects.length > 0);
    assert.match(command.agent_next_step, /\S/);
    assert.ok(command.stable_errors.every((code) => code.startsWith("mindos.")));
  }
  assert.deepEqual(descriptor.commands.find((command) => command.name === "collect.rss.commit")?.effects, ["workspace.write", "network.write"]);
  assert.deepEqual(descriptor.commands.find((command) => command.name === "collect.twitter.commit")?.effects, ["workspace.write"]);
});

test("命令描述符拒绝未知字段和无效技能引用", () => {
  for (const command of descriptor.commands) {
    assert.equal("runtime_dispatch" in command, false);
    assert.equal("skill" in command, false);
    assert.equal(Object.hasOwn(command, "result_schema"), command.name !== "mcp.serve");
  }

  const skillReferences: ReadonlyArray<readonly [string, string]> = [
    ["wiki.init", ".agents/skills/mind-os/SKILL.md"],
    ["collect.twitter.prepare", ".agents/skills/twitter-digest/SKILL.md"],
    ["collect.twitter.commit", ".agents/skills/twitter-digest/SKILL.md"],
    ["distill.scan", ".agents/skills/distill/SKILL.md"],
    ["distill.commit", ".agents/skills/distill/SKILL.md"],
    ["radar.prepare", ".agents/skills/radar-review/SKILL.md"],
    ["radar.commit", ".agents/skills/radar-review/SKILL.md"],
  ];

  for (const [command, path] of skillReferences) {
    assert.match(
      readFileSync(join(process.cwd(), path), "utf8"),
      new RegExp(`mindos ${command.replaceAll(".", " ")}`),
    );
  }

  assert.throws(() => {
    const matched = descriptor.commands.find((command) => command.name === "unknown.command");
    assert.ok(matched, "未发布的技能命令不得进入静态描述符");
  });
});
