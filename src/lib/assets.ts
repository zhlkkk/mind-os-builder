import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MindosError } from "./paths.js";

const assetNames = new Set([".agents/skills", "agents", "adapters", "contracts", "data", "jobs"]);

export type AssetFile = { relative: string; content: Uint8Array };

export async function readAssetTree(root: string): Promise<AssetFile[]> {
  const assets: AssetFile[] = [];
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    const path = join(entry.parentPath, entry.name);
    if (entry.isSymbolicLink()) {
      throw new MindosError("mindos.filesystem.symlink", "package asset contains a symbolic link");
    }
    if (entry.isFile()) {
      assets.push({ relative: relative(root, path).replaceAll("\\", "/"), content: await readFile(path) });
    }
  }
  return assets.sort((left, right) => left.relative.localeCompare(right.relative));
}

export function packageRoot(): string {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.env.MINDOS_ASSET_ROOT, resolve(moduleDirectory, "../.."), resolve(moduleDirectory, "../../.."), process.cwd()];
  for (const candidate of candidates) {
    if (candidate !== undefined && existsSync(join(candidate, "package.json"))) {
      return candidate;
    }
  }
  throw new MindosError("mindos.filesystem.invalid_root", "cannot locate package assets");
}

export function assetPath(name: string): string {
  if (!assetNames.has(name)) {
    throw new MindosError("mindos.input.invalid", "unknown package asset");
  }
  const path = join(packageRoot(), name);
  if (!existsSync(path)) {
    throw new MindosError("mindos.filesystem.invalid_root", "published package asset is missing");
  }
  return path;
}
