import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

export class MindosError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "MindosError";
  }
}

export type PathOptions = {
  capability?: "research";
};

const protectedPrefixes = ["wiki/insights", "raw/logseq-import"];

function violation(message: string): MindosError {
  return new MindosError("mindos.filesystem.protected_path", message);
}

function partsFor(relative: string): string[] {
  if (relative.length === 0 || isAbsolute(relative)) {
    throw violation("path must be a non-empty vault-relative path");
  }

  const parts = relative.split(/[\\/]+/u);
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) {
    throw violation("path must not contain traversal segments");
  }
  return parts;
}

function checkProtectedPath(parts: readonly string[], options: PathOptions): void {
  const logical = parts.join("/");
  if (protectedPrefixes.some((prefix) => logical === prefix || logical.startsWith(`${prefix}/`))) {
    throw violation("path is in a protected directory");
  }
  if ((logical === "raw/research" || logical.startsWith("raw/research/")) && options.capability !== "research") {
    throw violation("raw/research requires research capability");
  }
}

async function assertNoSymlink(root: string, parts: readonly string[]): Promise<void> {
  let current = root;
  for (const part of parts) {
    current = resolve(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        throw violation("symbolic links are not writable");
      }
    } catch (error: unknown) {
      if (error instanceof MindosError) {
        throw error;
      }
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw new MindosError("mindos.filesystem.invalid_root", "cannot inspect target path");
    }
  }
}

export async function resolveWritePath(root: string, relative: string, options: PathOptions = {}): Promise<string> {
  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(root);
  } catch {
    throw new MindosError("mindos.filesystem.invalid_root", "vault root must exist");
  }

  const parts = partsFor(relative);
  checkProtectedPath(parts, options);
  const candidate = resolve(resolvedRoot, ...parts);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw violation("path escapes vault root");
  }
  await assertNoSymlink(resolvedRoot, parts);
  return candidate;
}

export async function resolveReadPath(root: string, relative: string): Promise<string> {
  let resolvedRoot: string;
  try {
    resolvedRoot = await realpath(root);
  } catch {
    throw new MindosError("mindos.filesystem.invalid_root", "vault root must exist");
  }
  const parts = partsFor(relative);
  const candidate = resolve(resolvedRoot, ...parts);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw violation("path escapes vault root");
  }
  await assertNoSymlink(resolvedRoot, parts);
  return candidate;
}
