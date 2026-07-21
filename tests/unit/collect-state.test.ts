import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { batchFile, loadBatch, saveBatch, vaultKey } from "../../src/collect/batch.js";
import { batchHash, type Batch } from "../../src/collect/model.js";
import { MindosError } from "../../src/lib/paths.js";
import { initializeWiki } from "../../src/wiki/init.js";

test("批次按 vault 隔离、限制权限、校验完整性与 24 小时 TTL", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-batch-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); const other = join(root, "other"); await initializeWiki(vault, true); await initializeWiki(other, true);
  const now = Date.now();
  const payload: Omit<Batch, "baseline_hash"> = { version: "v1", id: "a".repeat(32), vault: await vaultKey(vault), source: "rss", created_at: now - 25 * 3_600_000, initial_cursor: null, next_cursor: null, signals: [], config: { output: "raw/collect/rss", categories: { other: "其他" }, filters: { include: [], exclude: [], weights: {}, minimum: 0, limit: 50 } } };
  const batch: Batch = { ...payload, baseline_hash: batchHash(payload) }; await saveBatch(vault, batch); const path = await batchFile(vault, batch.id);
  assert.equal((await stat(path)).mode & 0o777, 0o600); assert.equal((await stat(dirname(path))).mode & 0o777, 0o700);
  await assert.rejects(loadBatch(vault, batch.id, "rss", false, now), (error: unknown) => error instanceof MindosError && error.code === "mindos.state.batch_expired");
  assert.equal((await loadBatch(vault, batch.id, "rss", true, now)).id, batch.id);
  await assert.rejects(loadBatch(other, batch.id, "rss", true, now), (error: unknown) => error instanceof MindosError && error.code === "mindos.state.batch_missing");
  const tampered = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>; tampered.next_cursor = "tampered"; await writeFile(path, JSON.stringify(tampered));
  await assert.rejects(loadBatch(vault, batch.id, "rss", true, now), (error: unknown) => error instanceof MindosError && error.code === "mindos.state.conflict");
});
