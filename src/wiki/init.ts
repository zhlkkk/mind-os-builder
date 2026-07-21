import { lstat, mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { assetPath, readAssetTree, type AssetFile } from "../lib/assets.js";
import { acquireLock } from "../lib/lock.js";
import { MindosError } from "../lib/paths.js";
import { appliedResult, blockedFromError, noopResult, previewResult, type CliResult } from "../lib/result.js";
import { contentHash } from "../lib/write.js";

const directories = [".mindos", "raw/assets", "raw/logseq-import", "wiki/concepts", "wiki/entities", "wiki/connections", "wiki/insights", "journals", "templates"];

async function lstatOrUndefined(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function vaultMatches(vault: string, assets: readonly AssetFile[]): Promise<boolean> {
  const metadata = await lstatOrUndefined(vault);
  if (metadata === undefined || !metadata.isDirectory() || metadata.isSymbolicLink()) {
    return false;
  }
  const expected = new Set(assets.map((asset) => asset.relative));
  const allowedDirectories = new Set(directories);
  for (const path of [...directories, ...assets.map((asset) => asset.relative)]) {
    const parts = path.split("/");
    parts.pop();
    for (let index = 1; index <= parts.length; index += 1) {
      allowedDirectories.add(parts.slice(0, index).join("/"));
    }
  }
  async function inspect(current: string): Promise<boolean> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      const relative = path.slice(vault.length + 1).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) {
        return false;
      }
      if (entry.isDirectory()) {
        if (!allowedDirectories.has(relative)) {
          return false;
        }
        if (!await inspect(path)) {
          return false;
        }
      } else if (!entry.isFile() || !expected.has(relative)) {
        return false;
      }
    }
    return true;
  }
  if (!await inspect(vault)) {
    return false;
  }
  return (await Promise.all(assets.map(async (asset) => {
    try {
      return Buffer.compare(await readFile(join(vault, asset.relative)), asset.content) === 0;
    } catch {
      return false;
    }
  }))).every(Boolean);
}

function assertTargetSyntax(target: string): void {
  if (target.split(/[\\/]+/u).includes("..")) {
    throw new MindosError("mindos.filesystem.protected_path", "vault path must not contain traversal segments");
  }
}

async function assertSafeVault(vault: string): Promise<void> {
  const metadata = await lstatOrUndefined(vault);
  if (metadata?.isSymbolicLink()) {
    throw new MindosError("mindos.filesystem.protected_path", "vault root must not be a symbolic link");
  }
  if (metadata !== undefined && !metadata.isDirectory()) {
    throw new MindosError("mindos.state.conflict", "vault path is occupied by a file");
  }
}

function artifacts(assets: readonly AssetFile[]): CliResult["artifacts"] {
  return [
    ...directories.map((path) => ({ kind: "directory", path })),
    ...assets.map((asset) => ({ kind: "file", path: asset.relative })),
  ];
}

export async function initializeWiki(target: string, apply = false): Promise<CliResult> {
  let vault = "";
  let data: Record<string, unknown> = { files: 0, vault: target };
  try {
    assertTargetSyntax(target);
    vault = resolve(target);
    const dataRoot = join(assetPath("data"), "core");
    const assets = await readAssetTree(dataRoot);
    data = { files: assets.length, vault };
    await assertSafeVault(vault);
    if (await vaultMatches(vault, assets)) {
      return noopResult(data);
    }
    const existing = await lstatOrUndefined(vault);
    if (existing !== undefined && (await readdir(vault)).length > 0) {
      return blockedFromError(new MindosError("mindos.state.conflict", "vault contains unknown content"), data);
    }
    const planned = artifacts(assets);
    if (!apply) {
      return previewResult(data, planned);
    }
    await mkdir(dirname(vault), { recursive: true, mode: 0o700 });
    const lockKey = contentHash(Buffer.from(vault, "utf8")).slice(0, 16);
    const lock = await acquireLock(join(dirname(vault), `.${basename(vault)}-${lockKey}.lock`));
    try {
      await assertSafeVault(vault);
      if (await vaultMatches(vault, assets)) {
        return noopResult(data);
      }
      const changed = await lstatOrUndefined(vault);
      if (changed !== undefined && (await readdir(vault)).length > 0) {
        return blockedFromError(new MindosError("mindos.state.conflict", "vault changed during initialization"), data);
      }
      const staging = await mkdtemp(join(dirname(vault), ".mindos-wiki-init-"));
      try {
        for (const directory of directories) {
          await mkdir(join(staging, directory), { recursive: true, mode: 0o700 });
        }
        for (const asset of assets) {
          const destination = join(staging, asset.relative);
          await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
          await writeFile(destination, asset.content, { mode: 0o600 });
        }
        await rename(staging, vault);
      } finally {
        await rm(staging, { recursive: true, force: true });
      }
      return appliedResult(data, planned);
    } finally {
      await lock.release();
    }
  } catch (error: unknown) {
    return blockedFromError(error, data);
  }
}
