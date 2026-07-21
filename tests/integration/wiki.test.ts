import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

type Result = {
  ok: boolean;
  state: string;
  changed: boolean;
  data: Record<string, unknown>;
  error?: { code: string };
};

const cli = join(process.cwd(), "lib", "src", "cli.js");

function run(arguments_: string[]): Result {
  const completed = spawnSync(process.execPath, [cli, ...arguments_], { encoding: "utf8" });
  assert.equal(completed.stderr, "", completed.stderr);
  assert.notEqual(completed.stdout, "", "命令必须输出 JSON 结果");
  return JSON.parse(completed.stdout) as Result;
}

function hash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

test("wiki init 预演零写入、应用后幂等，并拒绝未知内容", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "mindos-wiki-"));
  context.after(async () => rm(sandbox, { recursive: true, force: true }));
  const vault = join(sandbox, "vault");
  await mkdir(vault);

  const preview = run(["wiki", "init", vault, "--json"]);
  assert.deepEqual({ ok: preview.ok, state: preview.state, changed: preview.changed }, { ok: true, state: "preview", changed: false });
  await assert.rejects(readFile(join(vault, "wiki", "index.md"), "utf8"));

  const applied = run(["wiki", "init", vault, "--apply", "--json"]);
  assert.deepEqual({ ok: applied.ok, state: applied.state, changed: applied.changed }, { ok: true, state: "applied", changed: true });
  assert.match(await readFile(join(vault, "AGENTS.md"), "utf8"), /本地 LLM Wiki/);
  assert.match(await readFile(join(vault, "wiki", "index.md"), "utf8"), /\[\[welcome\]\]/);

  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "noop");

  const occupied = join(sandbox, "occupied");
  await mkdir(occupied);
  await writeFile(join(occupied, "mine.md"), "保留", "utf8");
  const occupiedResult = run(["wiki", "init", occupied, "--apply", "--json"]);
  assert.deepEqual({ ok: occupiedResult.ok, state: occupiedResult.state, code: occupiedResult.error?.code }, { ok: false, state: "blocked", code: "mindos.state.conflict" });
  assert.equal(await readFile(join(occupied, "mine.md"), "utf8"), "保留");

  const traversal = run(["wiki", "init", `${sandbox}/parent/../traversal`, "--apply", "--json"]);
  assert.deepEqual({ ok: traversal.ok, state: traversal.state, code: traversal.error?.code }, { ok: false, state: "blocked", code: "mindos.filesystem.protected_path" });
});

test("wiki lint、ingest 与 query 保持路径、哈希和受保护目录边界", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "mindos-wiki-"));
  context.after(async () => rm(sandbox, { recursive: true, force: true }));
  const vault = join(sandbox, "vault");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");

  const broken = join(vault, "wiki", "concepts", "broken.md");
  await writeFile(broken, "# Broken\n\n[[missing-page]]\n", "utf8");
  const beforeLint = await readFile(join(vault, "wiki", "insights").replace(/insights$/, "index.md"), "utf8");
  const lint = run(["wiki", "lint", vault, "--json"]);
  const codes = (lint.data.issues as Array<{ code: string }>).map((issue) => issue.code);
  assert.ok(codes.includes("frontmatter_missing"));
  assert.ok(codes.includes("red_link"));
  assert.ok(codes.includes("index_missing"));
  assert.equal(await readFile(join(vault, "wiki", "index.md"), "utf8"), beforeLint);

  const candidate = join(sandbox, "candidate.md");
  const content = "---\ndomain: agents\nsources: 1\ncreated: 2026-07-21\nupdated: 2026-07-21\ntags: [agents]\n---\n# Agent Harness\n\n确定性核心由适配器复用。\n";
  await writeFile(candidate, content, "utf8");
  const path = "wiki/concepts/agent-harness.md";
  assert.equal(run(["wiki", "ingest", vault, path, candidate, "--json"]).state, "preview");
  await assert.rejects(readFile(join(vault, path), "utf8"));
  assert.equal(run(["wiki", "ingest", vault, path, candidate, "--apply", "--json"]).state, "applied");
  assert.match(await readFile(join(vault, "wiki", "index.md"), "utf8"), /\[\[agent-harness\]\]/);
  assert.match(await readFile(join(vault, "wiki", "log.md"), "utf8"), /\[\[agent-harness\]\]/);
  assert.equal((run(["wiki", "query", vault, "确定性核心", "--json"]).data.matches as Array<{ path: string }>)[0]?.path, path);
  await writeFile(join(vault, "wiki", "insights", "human.md"), "人类洞察可被查询。\n", "utf8");
  assert.equal((run(["wiki", "query", vault, "人类洞察", "--json"]).data.matches as Array<{ path: string }>)[0]?.path, "wiki/insights/human.md");

  const updated = content.replace("确定性核心", "可移植确定性核心");
  await writeFile(candidate, updated, "utf8");
  const conflict = run(["wiki", "ingest", vault, path, candidate, "--apply", "--json"]);
  assert.deepEqual({ ok: conflict.ok, state: conflict.state, code: conflict.error?.code }, { ok: false, state: "blocked", code: "mindos.state.conflict" });
  assert.equal(await readFile(join(vault, path), "utf8"), content);
  assert.equal(run(["wiki", "ingest", vault, path, candidate, "--expected-hash", hash(content), "--apply", "--json"]).state, "applied");

  const protectedResult = run(["wiki", "ingest", vault, "wiki/insights/private.md", candidate, "--apply", "--json"]);
  assert.deepEqual({ ok: protectedResult.ok, state: protectedResult.state, code: protectedResult.error?.code }, { ok: false, state: "blocked", code: "mindos.filesystem.protected_path" });

  const outside = join(sandbox, "outside.md");
  await writeFile(outside, "outside", "utf8");
  await unlink(join(vault, path));
  await symlink(outside, join(vault, path));
  const symlinkResult = run(["wiki", "ingest", vault, path, candidate, "--expected-hash", hash(updated), "--apply", "--json"]);
  assert.deepEqual({ ok: symlinkResult.ok, state: symlinkResult.state, code: symlinkResult.error?.code }, { ok: false, state: "blocked", code: "mindos.filesystem.protected_path" });
  assert.equal(await readFile(outside, "utf8"), "outside");
});

test("wiki ingest 拒绝指向 vault 外的锁目录", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "mindos-wiki-lock-"));
  context.after(async () => rm(sandbox, { recursive: true, force: true }));
  const vault = join(sandbox, "vault");
  const outside = join(sandbox, "outside");
  const candidate = join(sandbox, "candidate.md");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  await mkdir(outside);
  await symlink(outside, join(vault, ".mindos", "locks"));
  await writeFile(candidate, "---\ndomain: agents\nsources: []\ncreated: 2026-07-21\nupdated: 2026-07-21\ntags: [agents]\n---\n# Lock Guard\n", "utf8");

  const result = run(["wiki", "ingest", vault, "wiki/concepts/lock-guard.md", candidate, "--apply", "--json"]);

  assert.deepEqual(
    { ok: result.ok, state: result.state, code: result.error?.code },
    { ok: false, state: "blocked", code: "mindos.filesystem.protected_path" },
  );
  assert.deepEqual(await readdir(outside), []);
  await assert.rejects(readFile(join(vault, "wiki", "concepts", "lock-guard.md"), "utf8"));
});
