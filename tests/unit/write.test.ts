import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MindosError } from "../../src/lib/paths.js";
import { atomicWrite } from "../../src/lib/write.js";

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

test("原子写入要求匹配基线且保留冲突前内容", async () => {
  const root = await mkdtemp(join(tmpdir(), "mindos-write-"));
  await writeFile(join(root, "note.md"), "before", "utf8");

  await assert.rejects(
    () => atomicWrite(root, "note.md", "after", { expectedHash: digest("other") }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.state.conflict",
  );
  assert.equal(await readFile(join(root, "note.md"), "utf8"), "before");

  const outcome = await atomicWrite(root, "note.md", "after", { expectedHash: digest("before") });
  assert.equal(outcome.changed, true);
  assert.equal(await readFile(join(root, "note.md"), "utf8"), "after");
});

test("相同内容返回 noop", async () => {
  const root = await mkdtemp(join(tmpdir(), "mindos-write-"));
  await writeFile(join(root, "note.md"), "same", "utf8");
  const outcome = await atomicWrite(root, "note.md", "same");
  assert.equal(outcome.changed, false);
  assert.equal(outcome.hash, digest("same"));
});

test("预期不存在时拒绝覆盖并发创建的文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "mindos-write-"));
  await writeFile(join(root, "note.md"), "用户内容", "utf8");

  await assert.rejects(
    () => atomicWrite(root, "note.md", "工具内容", { expectedHash: null }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.state.conflict",
  );
  assert.equal(await readFile(join(root, "note.md"), "utf8"), "用户内容");
});

test("两个预期不存在的并发写入只有一个能发布", async () => {
  const root = await mkdtemp(join(tmpdir(), "mindos-write-"));
  const results = await Promise.allSettled([
    atomicWrite(root, "note.md", "first", { expectedHash: null }),
    atomicWrite(root, "note.md", "second", { expectedHash: null }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof MindosError);
  assert.equal(rejected.reason.code, "mindos.state.conflict");
  assert.match(await readFile(join(root, "note.md"), "utf8"), /^(?:first|second)$/u);
});
