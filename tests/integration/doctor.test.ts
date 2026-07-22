import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join } from "node:path";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("mindos doctor --json 返回 v1 契约且不安装依赖", async () => {
  const cli = join(process.cwd(), "lib", "src", "cli.js");
  const { stdout, stderr } = await execFileAsync(process.execPath, [cli, "doctor", "--json"]);
  assert.equal(stderr, "");
  const result = JSON.parse(stdout) as { version: string; ok: boolean; state: string; changed: boolean; data: { platform: { certified: boolean }; dependencies: Record<string, { available: boolean }> } };
  assert.equal(result.version, "v1");
  assert.equal(result.ok, true);
  assert.equal(result.state, "preview");
  assert.equal(result.changed, false);
  assert.equal(typeof result.data.platform.certified, "boolean");
  assert.deepEqual(Object.keys(result.data.dependencies).sort(), ["folo", "obsidian", "opencli"]);
});

test("mindos doctor 将超时和缺失 CLI 标为不可用", async () => {
  const cli = join(process.cwd(), "lib", "src", "cli.js");
  const fakeBin = await mkdtemp(join(tmpdir(), "mindos-doctor-"));
  const opencli = join(fakeBin, "opencli");
  const folo = join(fakeBin, "folo");
  try {
    await writeFile(opencli, "#!/bin/sh\nexec /bin/sleep 5\n", { mode: 0o755 });
    await symlink(process.execPath, folo);

    const { stdout } = await execFileAsync(process.execPath, [cli, "doctor", "--json"], {
      env: { ...process.env, PATH: fakeBin },
    });
    const result = JSON.parse(stdout) as { data: { dependencies: Record<string, { available: boolean }> } };
    assert.equal(result.data.dependencies.opencli?.available, false, "超时 CLI 不可用");
    assert.equal(result.data.dependencies.folo?.available, true, "正常关闭的 CLI 可用");
    assert.equal(result.data.dependencies.obsidian?.available, false, "缺失 CLI 不可用");
  } finally {
    await rm(fakeBin, { recursive: true, force: true });
  }
});
