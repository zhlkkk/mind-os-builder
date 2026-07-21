import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveBatch, vaultKey } from "../../src/collect/batch.js";
import { commitCollection, type DecisionInput } from "../../src/collect/commit.js";
import { batchHash, type Batch } from "../../src/collect/model.js";
import { initializeWiki } from "../../src/wiki/init.js";

test("每个提交阶段中断后都沿用首次日期并收敛", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-recovery-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const first = Date.parse("2026-07-21T23:59:00Z"); const later = Date.parse("2026-07-22T00:01:00Z");
  for (const [index, phase] of ["reserved", "output", "seen", "cursor", "applied"].entries()) {
    const vault = join(root, String(index)); assert.equal((await initializeWiki(vault, true)).state, "applied");
    const id = index.toString(16).padStart(32, "a").slice(-32); const payload: Omit<Batch, "baseline_hash"> = {
      version: "v1", id, vault: await vaultKey(vault), source: "twitter", created_at: first, initial_cursor: null, next_cursor: "next",
      signals: [{ id: `signal-${index}`, title: "Original", content: "details", url: "https://example.test/item", author: "" }],
      config: { output: "raw/collect/twitter", categories: { other: "其他" }, filters: { include: [], exclude: [], weights: {}, minimum: 0, limit: 50 } },
    };
    const batch: Batch = { ...payload, baseline_hash: batchHash(payload) }; await saveBatch(vault, batch);
    const input: DecisionInput = { version: "v1", batch_id: id, baseline_hash: batch.baseline_hash, decisions: [{ id: `signal-${index}`, decision: "keep", reason: "有效", display_title: "标题", display_summary: "摘要", translated: false, category: "other" }] };
    await assert.rejects(commitCollection(vault, "twitter", input, { apply: true, now: first, afterPhase: (current) => { if (current === phase) throw new Error("synthetic interruption"); } }));
    const recovered = await commitCollection(vault, "twitter", input, { apply: true, now: later }); assert.equal(recovered.target, "raw/collect/twitter/2026-07-21.md");
    assert.match(await readFile(join(vault, "raw/collect/twitter/2026-07-21.md"), "utf8"), new RegExp(`signal-${index}`, "u"));
    await assert.rejects(readFile(join(vault, "raw/collect/twitter/2026-07-22.md"), "utf8"));
    assert.equal((await commitCollection(vault, "twitter", input, { apply: true, now: later })).changed, false);
  }
});
