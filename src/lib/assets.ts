import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MindosError } from "./paths.js";

const assetNames = new Set([".agents/skills", "agents", "adapters", "contracts", "data", "jobs"]);

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
