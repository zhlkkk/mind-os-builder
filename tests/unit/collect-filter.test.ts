import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { filterSignals, loadCollectConfig, normalizeProvider } from "../../src/collect/model.js";
import { MindosError } from "../../src/lib/paths.js";

test("Provider 规范化、确定性过滤与数量上限保持独立", () => {
  const normalized = normalizeProvider("rss", { entries: [
    { id: "one", title: "Agent benchmark", summary: "source", link: "https://example.test/one" },
    { id: "two", title: "income story", summary: "marketing", link: "https://example.test/two" },
    { id: "three", title: "Agent protocol", summary: "details", link: "https://example.test/three" },
  ], cursor: "next" });
  const result = filterSignals(normalized.signals, { include: ["agent"], exclude: ["income"], weights: { benchmark: 2, protocol: 1 }, minimum: 1, limit: 1 });
  assert.deepEqual(result.signals.map((signal) => signal.id), ["one"]);
  assert.deepEqual(result.rejected, { excluded: 1, not_included: 0, below_score: 0, limited: 1 });
  assert.equal(normalized.cursor, "next");
});

test("OpenCLI Twitter 条目可使用 text 作为标题", () => {
  const normalized = normalizeProvider("twitter", [{
    id: "tweet-1", author: "author", text: "只有正文的推文", url: "https://x.com/author/status/1",
    replies: 3, views: 4_000, retweets: 5, likes: 20,
  }]);
  assert.deepEqual(normalized.signals, [{
    id: "tweet-1", title: "只有正文的推文", content: "只有正文的推文", url: "https://x.com/author/status/1", author: "author",
    replies: 3, views: 4_000, retweets: 5, likes: 20,
  }]);
});

test("Twitter 互动数缺失时省略，非法时拒绝", () => {
  const withoutMetrics = normalizeProvider("twitter", [{ id: "one", text: "正文", url: "https://x.com/author/status/1" }]);
  assert.deepEqual(withoutMetrics.signals[0], { id: "one", title: "正文", content: "正文", url: "https://x.com/author/status/1", author: "" });
  const withZero = normalizeProvider("twitter", [{ id: "zero", text: "正文", url: "https://x.com/author/status/2", likes: 0 }]);
  assert.equal(withZero.signals[0]?.likes, 0);
  for (const likes of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, "4"]) {
    assert.throws(
      () => normalizeProvider("twitter", [{ id: "one", text: "正文", url: "https://x.com/author/status/1", likes }]),
      (error: unknown) => error instanceof MindosError && error.code === "mindos.provider.invalid_output",
    );
  }
  const rss = normalizeProvider("rss", [{ id: "entry", title: "正文", url: "https://example.test/entry", likes: 4 }]);
  assert.deepEqual(rss.signals[0], { id: "entry", title: "正文", content: "", url: "https://example.test/entry", author: "" });
});

test("每日文件模板不能逃逸采集目录", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-collect-config-")); context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".mindos"));
  await writeFile(join(root, ".mindos/config.yaml"), "collect:\n  twitter:\n    daily_filename: '../{date}.md'\n");
  await assert.rejects(loadCollectConfig(root, "twitter"), (error: unknown) => error instanceof MindosError && error.code === "mindos.input.invalid");
});

test("RSS 已读同步默认关闭且只接受布尔配置", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-rss-read-config-")); context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".mindos")); const path = join(root, ".mindos/config.yaml");
  await writeFile(path, "collect:\n  rss: {}\n");
  assert.equal((await loadCollectConfig(root, "rss")).markReadAfterCommit, false);
  await writeFile(path, "collect:\n  rss:\n    mark_read_after_commit: enabled\n");
  await assert.rejects(loadCollectConfig(root, "rss"), (error: unknown) => error instanceof MindosError && error.code === "mindos.input.invalid");
});
