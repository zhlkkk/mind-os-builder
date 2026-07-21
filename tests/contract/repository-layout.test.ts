import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  bin: Record<string, string>;
  engines: Record<string, string>;
  files: string[];
  type: string;
};

test("发布清单只包含公开运行时资源", () => {
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.engines.node, ">=24 <25");
  assert.equal(packageJson.bin.mindos, "./lib/src/cli.js");
  for (const required of [".agents/skills", "agents", "adapters", "contracts", "data", "jobs", "docs", "scripts"]) {
    assert.ok(packageJson.files.includes(required), `缺少发布目录: ${required}`);
    assert.ok(existsSync(join(root, required)), `目录不存在: ${required}`);
  }
  for (const forbidden of ["src", "tests", "raw", ".cache", "private", "tests/fixtures", "**/__pycache__/**", "**/*.pyc"]) {
    assert.equal(packageJson.files.includes(forbidden), false, `不应发布: ${forbidden}`);
  }

  const pack = JSON.parse(
    execFileSync("npm", ["pack", "--dry-run", "--json"], { encoding: "utf8" }),
  ) as Array<{ files: Array<{ path: string }> }> | Record<string, { files: Array<{ path: string }> }>;
  const packedPackage = Array.isArray(pack) ? pack[0] : Object.values(pack)[0];
  const packedPaths = new Set(packedPackage?.files.map((file) => file.path) ?? []);
  assert.equal(packedPaths.has("lib/src/cli.js"), true, "npm 包必须包含构建后的 mindos 入口");
  assert.equal([...packedPaths].some((path) => path.endsWith(".pyc") || path.includes("__pycache__")), false);
});

test("构建后的命令行提供帮助和版本", () => {
  const cli = join(root, "lib", "src", "cli.js");
  assert.equal(existsSync(cli), true, "请先构建 TypeScript CLI");
  assert.equal(readFileSync(cli, "utf8").startsWith("#!/usr/bin/env node\n"), true);
  assert.match(execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" }), /mindos/);
  assert.match(execFileSync(process.execPath, [cli, "--version"], { encoding: "utf8" }), /^0\.1\.0/);
});

test("迁移语料覆盖七个工作流及其边界结果", () => {
  const corpus = JSON.parse(readFileSync(join(root, "tests", "fixtures", "migration", "corpus.json"), "utf8")) as {
    synthetic: boolean;
    cases: Array<{ workflow: string; scenario: string }>;
  };
  assert.equal(corpus.synthetic, true);
  assert.deepEqual(
    corpus.cases.map((item) => item.workflow),
    ["wiki", "books", "twitter", "folo", "distill", "radar", "research"],
  );
  assert.deepEqual(
    corpus.cases.map((item) => item.scenario),
    ["preview", "noop", "needs_agent", "dependency_failure", "preview", "conflict", "applied"],
  );
});
