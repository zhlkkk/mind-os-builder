import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

async function digest(root: string): Promise<string> {
  const hash = createHash("sha256");
  async function visit(path: string, relative: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const nextRelative = relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
      const nextPath = join(path, entry.name);
      hash.update(`${nextRelative}\0${entry.isDirectory() ? "directory" : "file"}\0`);
      if (entry.isDirectory()) {
        await visit(nextPath, nextRelative);
      } else {
        hash.update(await readFile(nextPath));
      }
      hash.update("\0");
    }
  }
  await visit(root, "");
  return hash.digest("hex");
}

test("npm tarball 安装后使用与源码一致的规范 Skill 资产", async () => {
  const root = await mkdtemp(join(tmpdir(), "mindos-package-assets-"));
  let tarball: string | undefined;
  try {
    const packed = await execFileAsync("npm", ["pack", "--json"], { cwd: process.cwd() });
    const metadata = JSON.parse(packed.stdout) as Record<string, { filename: string }>;
    const first = Object.values(metadata)[0];
    if (first === undefined) {
      throw new Error("npm pack did not produce a tarball");
    }
    tarball = join(process.cwd(), first.filename);

    await execFileAsync("npm", ["install", "--ignore-scripts", "--prefix", root, tarball]);
    const installed = join(root, "node_modules", "mind-os-builder");
    const sourceDigest = await digest(join(process.cwd(), ".agents", "skills"));
    const packageDigest = await digest(join(installed, ".agents", "skills"));
    assert.equal(packageDigest, sourceDigest);

    const cli = join(installed, "lib", "src", "cli.js");
    const project = join(root, "consumer");
    const home = join(root, "home");
    const applied = await execFileAsync(process.execPath, [
      cli,
      "skills",
      "install",
      "claude-code",
      "--scope",
      "project",
      "--project",
      project,
      "--home",
      home,
      "--apply",
      "--json",
    ]);
    const result = JSON.parse(applied.stdout) as { version: string; state: string; data: { source: string } };
    assert.equal(result.version, "v1");
    assert.equal(result.state, "applied");
    assert.match(result.data.source, /node_modules\/mind-os-builder\/.agents\/skills$/u);
  } finally {
    if (tarball !== undefined) {
      await rm(tarball, { force: true });
    }
    await rm(root, { recursive: true, force: true });
  }
});
