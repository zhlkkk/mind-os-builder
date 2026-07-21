import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MindosError, resolveWritePath } from "../../src/lib/paths.js";

async function vault(): Promise<string> {
  return mkdtemp(join(tmpdir(), "mindos-paths-"));
}

test("写路径拒绝逃逸、受保护目录和符号链接", async () => {
  const root = await vault();
  const outside = await mkdtemp(join(tmpdir(), "mindos-outside-"));
  await mkdir(join(root, "wiki"));
  await symlink(outside, join(root, "wiki", "link"));
  await writeFile(join(root, "wiki", "file-link.md"), "safe");
  await symlink(join(root, "wiki", "file-link.md"), join(root, "wiki", "linked.md"));

  for (const candidate of ["../outside.md", "/tmp/outside.md", "wiki/insights/private.md", "raw/logseq-import/a.md", "wiki/link/a.md", "wiki/linked.md"]) {
    await assert.rejects(
      () => resolveWritePath(root, candidate),
      (error: unknown) => error instanceof MindosError && error.code === "mindos.filesystem.protected_path",
    );
  }
});

test("研究目录要求明确 capability", async () => {
  const root = await vault();
  await assert.rejects(() => resolveWritePath(root, "raw/research/report.md"));
  assert.match(await resolveWritePath(root, "raw/research/report.md", { capability: "research" }), /raw\/research\/report\.md$/);
});
