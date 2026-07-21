import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, chmod, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { runOfflineJourney } from "../../examples/offline-full-journey.js";

const execFileAsync = promisify(execFile);

test("npm tarball 在空前缀完成公开离线旅程且不启动 Python", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "mindos-e2e-")); context.after(async () => rm(root, { recursive: true, force: true })); const pack = join(root, "pack"); const prefix = join(root, "prefix"); await mkdir(pack); await mkdir(prefix);
  const shims = join(root, "no-python"); const invocationLog = join(root, "python-invocations.log"); await mkdir(shims); await writeFile(invocationLog, "");
  const shim = "#!/bin/sh\nprintf '%s\\n' \"$0\" >> \"$MINDOS_PYTHON_INVOCATIONS\"\nexit 97\n";
  for (const command of ["python", "python3", "uv"]) { const path = join(shims, command); await writeFile(path, shim); await chmod(path, 0o700); }
  const env = { ...process.env, MINDOS_PYTHON_INVOCATIONS: invocationLog, PATH: `${shims}:${dirname(process.execPath)}:${process.env.PATH ?? ""}` };
  await execFileAsync("npm", ["pack", "--pack-destination", pack], { cwd: process.cwd(), env }); const archive = join(pack, (await readdir(pack)).find((name) => name.endsWith(".tgz")) ?? "missing.tgz");
  await execFileAsync("npm", ["install", "--offline", "--ignore-scripts", "--no-package-lock", "--prefix", prefix, archive], { env }); const cli = join(prefix, "node_modules/.bin/mindos");
  const previousPath = process.env.PATH; const previousLog = process.env.MINDOS_PYTHON_INVOCATIONS; process.env.PATH = env.PATH; process.env.MINDOS_PYTHON_INVOCATIONS = invocationLog;
  let journey: Record<string, unknown>;
  try { journey = await runOfflineJourney(cli, join(root, "vault"), join(root, "work")); }
  finally { if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath; if (previousLog === undefined) delete process.env.MINDOS_PYTHON_INVOCATIONS; else process.env.MINDOS_PYTHON_INVOCATIONS = previousLog; }
  assert.equal(journey.version, "v1"); assert.equal(journey.jobs, 6); assert.equal(await readFile(invocationLog, "utf8"), "");
  for (const path of ["AGENTS.md", "wiki/index.md", "wiki/books/books.base", "raw/research/2026-07-21-synthetic.md", ".mindos/collect/seen.json"]) await access(join(root, "vault", path));
  assert.deepEqual((await readdir(join(root, "work/host/.agents/skills/distill/references/roles"))).sort(), ["ember.md", "lumina.md", "nexus.md", "prism.md", "vector.md"]);
  const packageFiles = await readdir(join(prefix, "node_modules/mind-os-builder")); assert.equal(packageFiles.includes("pyproject.toml"), false); assert.equal(packageFiles.includes("uv.lock"), false);
});
