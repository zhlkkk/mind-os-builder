import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { saveBatch, vaultKey } from "../../src/collect/batch.js";
import { commitCollection, type DecisionInput } from "../../src/collect/commit.js";
import { batchHash, type Batch } from "../../src/collect/model.js";
import { initializeWiki } from "../../src/wiki/init.js";

test("提交器合并旧版日文件并按来源 URL 去重", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-legacy-merge-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); await initializeWiki(vault, true); const now = Date.parse("2026-07-22T08:00:00Z");
  const target = join(vault, "raw/twitter/2026-07-22-X精选信息简报.md");
  await writeFile(target, "---\ndate: 2026-07-22\ntweet_count: 2\nlast_updated: \"07:00\"\n---\n\n# 旧版简报\n\n## 二、开发工具\n\n1. 旧条目 — https://x.com/example/status/100\n\n<!-- mindos:collect:twitter:150 -->\n### 受管条目\n\n受管摘要\n\n- 来源：[整段原推文](<https://x.com/managed/status/150>)\n- 原文：原文内容\n- 标签：#tag\n");
  const payload: Omit<Batch, "baseline_hash"> = {
    version: "v1", id: "b".repeat(32), vault: await vaultKey(vault), source: "twitter", created_at: now,
    initial_cursor: null, next_cursor: null,
    signals: [
      { id: "100", title: "旧条目", content: "重复", url: "https://x.com/example/status/100", author: "" },
      { id: "200", title: "新条目", content: "新增", url: "https://x.com/example/status/200", author: "" },
    ],
    config: { output: "raw/twitter", filename: "{date}-X精选信息简报.md", categories: { agent: "一、AI Agent 与工程化基础设施", tools: "二、开发工具" }, filters: { include: [], exclude: [], weights: {}, minimum: 0, limit: 100 } },
  };
  const batch: Batch = { ...payload, baseline_hash: batchHash(payload) }; await saveBatch(vault, batch);
  const decisions: DecisionInput = {
    version: "v1", batch_id: batch.id, baseline_hash: batch.baseline_hash,
    decisions: batch.signals.map((signal) => ({ id: signal.id, decision: "keep", reason: "有效", display_title: signal.title, display_summary: signal.content, translated: false, category: "agent" })),
  };
  const result = await commitCollection(vault, "twitter", decisions, { apply: true, now }); assert.equal(result.target, "raw/twitter/2026-07-22-X精选信息简报.md");
  const content = await readFile(target, "utf8");
  assert.equal(content.includes("mindos:collect:twitter:100"), false);
  assert.match(content, /mindos:collect:twitter:200/u);
  assert.match(content, /<!-- mindos:collect:twitter:150 -->\n2\. \*\*受管条目\*\*：受管摘要\n {3}— \[@managed\]\(<https:\/\/x\.com\/managed\/status\/150>\)/u);
  assert.match(content, /<!-- mindos:collect:twitter:200 -->\n1\. \*\*新条目\*\*：新增\n {3}— \[@example\]\(<https:\/\/x\.com\/example\/status\/200>\)/u);
  assert.equal(content.includes("- 来源："), false); assert.equal(content.includes("- 原文："), false); assert.equal(content.includes("- 标签："), false);
  assert.equal(content.match(/^## 一、AI Agent 与工程化基础设施$/gmu)?.length, 1);
  assert.ok(content.indexOf("## 一、AI Agent") < content.indexOf("## 二、开发工具"));
  assert.match(content, /^tweet_count: 3$/mu);
  assert.equal(/^last_updated: "07:00"$/mu.test(content), false);
});

test("RSS 提交器把受管详细块收敛为旧版紧凑格式", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-rss-legacy-")); context.after(async () => rm(root, { recursive: true, force: true }));
  const vault = join(root, "vault"); await initializeWiki(vault, true); const now = Date.parse("2026-07-22T08:00:00Z");
  const target = join(vault, "raw/rss/2026-07-22-Folo精选信息简报.md");
  await writeFile(target, "---\ndate: 2026-07-22\nentry_count: 2\nlast_updated: \"07:00\"\n---\n\n# 旧版简报\n\n## 三、开发工具\n\n1. **旧条目**：旧摘要\n   — [旧订阅源](https://example.test/100) · Folo entry `100`\n\n<!-- mindos:collect:rss:150 -->\n### 受管条目\n\n受管摘要\n\n- 来源：[文章原题](<https://example.test/150>)\n- 原文：原文内容\n- 标签：#tag\n");
  const payload: Omit<Batch, "baseline_hash"> = {
    version: "v1", id: "c".repeat(32), vault: await vaultKey(vault), source: "rss", created_at: now,
    initial_cursor: null, next_cursor: null,
    signals: [{ id: "150", title: "文章原题", content: "原文内容", url: "https://example.test/150", author: "示例订阅源" }],
    config: { output: "raw/rss", filename: "{date}-Folo精选信息简报.md", categories: { tools: "三、开发工具" }, filters: { include: [], exclude: [], weights: {}, minimum: 0, limit: 50 } },
  };
  const batch: Batch = { ...payload, baseline_hash: batchHash(payload) }; await saveBatch(vault, batch);
  const decisions: DecisionInput = {
    version: "v1", batch_id: batch.id, baseline_hash: batch.baseline_hash,
    decisions: [{ id: "150", decision: "discard", reason: "只迁移现有条目" }],
  };
  await commitCollection(vault, "rss", decisions, { apply: true, now }); const content = await readFile(target, "utf8");
  assert.match(content, /<!-- mindos:collect:rss:150 -->\n2\. \*\*受管条目\*\*：受管摘要\n {3}— \[示例订阅源\]\(<https:\/\/example\.test\/150>\) · Folo entry `150`/u);
  assert.equal(content.includes("### 受管条目"), false); assert.equal(content.includes("- 来源："), false);
  assert.equal(content.includes("- 原文："), false); assert.equal(content.includes("- 标签："), false);
  assert.match(content, /^entry_count: 2$/mu);
});
