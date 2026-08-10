import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveBatch, vaultKey } from "../../src/collect/batch.js";
import { commitCollection, type DecisionInput } from "../../src/collect/commit.js";
import { batchHash, type Batch } from "../../src/collect/model.js";
import { initializeWiki } from "../../src/wiki/init.js";

test("每个提交阶段中断后都沿用首次本地日期并收敛", async (context) => {
  const originalTimezone = process.env.TZ; process.env.TZ = "Asia/Shanghai";
  context.after(() => { if (originalTimezone === undefined) delete process.env.TZ; else process.env.TZ = originalTimezone; });
  const root = await mkdtemp(join(tmpdir(), "mindos-recovery-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const first = Date.parse("2026-08-05T16:23:00Z"); const later = first + 25 * 3_600_000;
  for (const [index, phase] of ["reserved", "output", "seen", "cursor", "applied"].entries()) {
    const vault = join(root, String(index)); assert.equal((await initializeWiki(vault, true)).state, "applied");
    const id = index.toString(16).padStart(32, "a").slice(-32); const payload: Omit<Batch, "baseline_hash"> = {
      version: "v1", id, vault: await vaultKey(vault), source: "twitter", created_at: first, initial_cursor: null, next_cursor: "next",
      signals: [{ id: `signal-${index}`, title: "原始标题", content: "原始详情", url: "https://example.test/item", author: "" }],
      config: { output: "raw/twitter", filename: "{date}-X精选信息简报.md", categories: { other: "其他" }, filters: { include: [], exclude: [], weights: {}, minimum: 0, limit: 50 } },
    };
    const batch: Batch = { ...payload, baseline_hash: batchHash(payload) }; await saveBatch(vault, batch);
    const input: DecisionInput = { version: "v1", batch_id: id, baseline_hash: batch.baseline_hash, decisions: [{ id: `signal-${index}`, decision: "keep", reason: "有效", display_title: "标题", display_summary: "摘要", translated: false, category: "other" }] };
    await assert.rejects(commitCollection(vault, "twitter", input, { apply: true, now: first, afterPhase: (current) => { if (current === phase) throw new Error("synthetic interruption"); } }));
    const recovered = await commitCollection(vault, "twitter", input, { apply: true, now: later }); assert.equal(recovered.target, "raw/twitter/2026-08-06-X精选信息简报.md");
    assert.match(await readFile(join(vault, "raw/twitter/2026-08-06-X精选信息简报.md"), "utf8"), new RegExp(`signal-${index}`, "u"));
    await assert.rejects(readFile(join(vault, "raw/twitter/2026-08-05-X精选信息简报.md"), "utf8"));
    assert.equal((await commitCollection(vault, "twitter", input, { apply: true, now: later })).changed, false);
  }
});

test("apply 已获授权但 receipt 尚未写入时可在批次过期后恢复", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-pre-receipt-recovery-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); assert.equal((await initializeWiki(vault, true)).state, "applied");
  const first = Date.parse("2026-08-05T01:00:00Z"); const later = first + 25 * 3_600_000; const id = "f".repeat(32);
  const payload: Omit<Batch, "baseline_hash"> = {
    version: "v1", id, vault: await vaultKey(vault), source: "twitter", created_at: first, initial_cursor: null, next_cursor: null,
    signals: [{ id: "signal", title: "原始标题", content: "原始详情", url: "https://x.com/tester/status/1", author: "tester" }],
    config: { output: "raw/twitter", filename: "{date}-X精选信息简报.md", categories: { other: "其他" }, filters: { include: [], exclude: [], weights: {}, minimum: 0, limit: 50 } },
  };
  const batch: Batch = { ...payload, baseline_hash: batchHash(payload) }; await saveBatch(vault, batch);
  const input: DecisionInput = { version: "v1", batch_id: id, baseline_hash: batch.baseline_hash, decisions: [{
    id: "signal", decision: "keep", reason: "有效", display_title: "恢复提交", display_summary: "恢复使用原始决策写入日报。", translated: false, category: "other",
  }] };
  const recovered = await commitCollection(vault, "twitter", input, { apply: true, now: later });
  assert.equal(recovered.changed, true); assert.equal((recovered.data.quality as { valid: boolean }).valid, true);
});
