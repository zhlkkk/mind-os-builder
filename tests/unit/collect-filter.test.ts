import assert from "node:assert/strict";
import test from "node:test";
import { filterSignals, normalizeProvider } from "../../src/collect/model.js";

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
