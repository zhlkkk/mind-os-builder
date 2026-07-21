import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MindosError } from "../../src/lib/paths.js";
import { parseJsonInput, readJsonInput, validateMarkdown, validateHttpUrl } from "../../src/lib/input.js";

test("不可信 JSON 受字节数与深度限制", () => {
  assert.deepEqual(parseJsonInput('{"ok":[1]}'), { ok: [1] });
  assert.throws(() => parseJsonInput('{"a":{"b":{"c":1}}}', { maxDepth: 2 }), MindosError);
  assert.throws(() => parseJsonInput('{"very":"long"}', { maxBytes: 4 }), MindosError);
});

test("Markdown 与 URL 原语拒绝控制字符和 URL 凭证", () => {
  assert.equal(validateMarkdown("# safe"), "# safe");
  assert.throws(() => validateMarkdown("bad\u0000"), MindosError);
  assert.throws(() => validateMarkdown("bad\u0007"), MindosError);
  assert.equal(validateHttpUrl("https://example.test/path").hostname, "example.test");
  assert.throws(() => validateHttpUrl("ftp://example.test"), MindosError);
  assert.throws(() => validateHttpUrl("https://user:pass@example.test"), MindosError);
});

test("JSON 文件在读取前检查大小", async () => {
  const root = await mkdtemp(join(tmpdir(), "mindos-input-"));
  const path = join(root, "candidate.json");
  await writeFile(path, '{"value":"too long"}', "utf8");
  await assert.rejects(() => readJsonInput(path, { maxBytes: 4 }), MindosError);
});
