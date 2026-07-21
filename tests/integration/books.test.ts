import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

type Result = { ok: boolean; state: string; changed: boolean; data: Record<string, unknown> };
const cli = join(process.cwd(), "lib", "src", "cli.js");

function run(arguments_: string[]): Result {
  const completed = spawnSync(process.execPath, [cli, ...arguments_], { encoding: "utf8" });
  assert.equal(completed.stderr, "", completed.stderr);
  assert.notEqual(completed.stdout, "", "命令必须输出 JSON 结果");
  return JSON.parse(completed.stdout) as Result;
}

test("books init 预演、应用与重复应用保持确定性", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "mindos-books-"));
  context.after(async () => rm(sandbox, { recursive: true, force: true }));
  const vault = join(sandbox, "vault");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");

  const preview = run(["books", "init", vault, "--json"]);
  assert.deepEqual({ ok: preview.ok, state: preview.state, changed: preview.changed }, { ok: true, state: "preview", changed: false });
  await assert.rejects(readFile(join(vault, "wiki", "books", "books.base"), "utf8"));

  const applied = run(["books", "init", vault, "--apply", "--json"]);
  assert.deepEqual({ ok: applied.ok, state: applied.state, changed: applied.changed }, { ok: true, state: "applied", changed: true });
  assert.match(await readFile(join(vault, "wiki", "books", "books.base"), "utf8"), /file\.folder == "wiki\/books"/);
  assert.match(await readFile(join(vault, "wiki", "books", "example-book.md"), "utf8"), /## 我的应用/);
  assert.equal(run(["books", "validate", vault, "--json"]).state, "noop");
  assert.equal(run(["books", "init", vault, "--apply", "--json"]).state, "noop");
});

test("books 保留同名用户文件，并校验 Base 过滤范围和合成书页", async (context) => {
  const sandbox = await mkdtemp(join(tmpdir(), "mindos-books-"));
  context.after(async () => rm(sandbox, { recursive: true, force: true }));
  const vault = join(sandbox, "vault");
  assert.equal(run(["wiki", "init", vault, "--apply", "--json"]).state, "applied");
  const template = join(vault, "templates", "book-template.md");
  await writeFile(template, "用户模板\n", "utf8");

  const applied = run(["books", "init", vault, "--apply", "--json"]);
  assert.equal(applied.state, "applied");
  assert.deepEqual(applied.data.conflicts, ["templates/book-template.md"]);
  assert.equal(await readFile(template, "utf8"), "用户模板\n");

  await writeFile(join(vault, "wiki", "books", ".mindos-runtime.md"), "运行态", "utf8");
  const example = join(vault, "wiki", "books", "example-book.md");
  await writeFile(example, (await readFile(example, "utf8")).replace("2026-07-20", "2026-02-30"), "utf8");
  await writeFile(join(vault, "wiki", "books", "books.base"), "filters:\n  and:\n    - file.ext == \"md\"\n", "utf8");
  const validation = run(["books", "validate", vault, "--json"]);
  assert.equal(validation.state, "preview");
  const codes = (validation.data.issues as Array<{ code: string }>).map((issue) => issue.code);
  assert.ok(codes.includes("unsafe_base_filter"));
  assert.ok(codes.includes("runtime_file_in_books"));
  assert.ok(codes.includes("invalid_date"));
});
