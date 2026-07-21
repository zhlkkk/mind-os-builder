import assert from "node:assert/strict";
import test from "node:test";
import { parseFrontmatter } from "../../src/lib/frontmatter.js";

test("frontmatter 解析保留边界、正文与失败原因", () => {
  const parsed = parseFrontmatter("---\ndomain: agents\ntags: [wiki]\n---\n# 正文\n");
  assert.equal(parsed.ok, true);
  if (parsed.ok) {
    assert.deepEqual(parsed.metadata, { domain: "agents", tags: ["wiki"] });
    assert.equal(parsed.body, "# 正文\n");
  }

  assert.deepEqual(parseFrontmatter("# 无 frontmatter\n"), { ok: false, reason: "missing" });
  assert.deepEqual(parseFrontmatter("---\ndomain: agents\n"), { ok: false, reason: "unclosed" });
  assert.deepEqual(parseFrontmatter("---\ninvalid: [\n---\n"), { ok: false, reason: "invalid" });
});

test("frontmatter 解析可限制长度并禁用 YAML 别名", () => {
  assert.deepEqual(
    parseFrontmatter(`---\n${"a".repeat(17)}\n---\n`, { maxLength: 16 }),
    { ok: false, reason: "too_large" },
  );
  assert.deepEqual(
    parseFrontmatter("---\nbase: &base [one]\nalias: *base\n---\n", { maxAliasCount: 0 }),
    { ok: false, reason: "invalid" },
  );
});
