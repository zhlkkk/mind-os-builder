import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MindosError } from "../../src/lib/paths.js";
import { acquireLock, releaseLock } from "../../src/lib/lock.js";

test("锁竞争被阻止，且 release 校验 token", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "mindos-lock-")), "operation.lock");
  const lock = await acquireLock(path);
  await assert.rejects(
    () => acquireLock(path),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.state.locked",
  );
  await assert.rejects(() => releaseLock(path, "wrong-token"));
  await lock.release();
  await acquireLock(path).then((next) => next.release());
});

test("外来陈旧锁永远不能回收", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "mindos-lock-")), "operation.lock");
  await writeFile(path, JSON.stringify({ token: "foreign", pid: 999_999, uid: -1, hostname: "foreign-host", createdAt: 0 }), "utf8");
  await assert.rejects(
    () => acquireLock(path, { staleAfterMs: 1 }),
    (error: unknown) => error instanceof MindosError && error.code === "mindos.state.locked",
  );
});

test("仅回收同机同用户且已死亡的陈旧锁", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "mindos-lock-")), "operation.lock");
  await writeFile(
    path,
    JSON.stringify({ token: "stale", pid: 999_999, uid: process.getuid?.(), hostname: hostname(), createdAt: 0 }),
    "utf8",
  );
  const lock = await acquireLock(path, { staleAfterMs: 1 });
  await lock.release();
});
