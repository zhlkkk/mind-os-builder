import { createHash, randomUUID } from "node:crypto";
import { chmod, link, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { MindosError, type PathOptions, resolveWritePath } from "./paths.js";

export type AtomicWriteOptions = PathOptions & {
  expectedHash?: string | null;
};

export type AtomicWriteOutcome = {
  changed: boolean;
  hash: string;
  path: string;
};

export function contentHash(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

async function existingContent(path: string): Promise<Uint8Array | undefined> {
  try {
    return await readFile(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new MindosError("mindos.filesystem.write_failed", "cannot read existing target");
  }
}

export async function atomicWrite(
  root: string,
  relative: string,
  content: string | Uint8Array,
  options: AtomicWriteOptions = {},
): Promise<AtomicWriteOutcome> {
  const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  let target = await resolveWritePath(root, relative, options);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  target = await resolveWritePath(root, relative, options);

  const existing = await existingContent(target);
  const currentHash = existing === undefined ? undefined : contentHash(existing);
  if (
    (options.expectedHash === null && existing !== undefined) ||
    (typeof options.expectedHash === "string" && options.expectedHash !== currentHash)
  ) {
    throw new MindosError("mindos.state.conflict", "target does not match expected baseline");
  }

  const nextHash = contentHash(bytes);
  if (currentHash === nextHash) {
    return { changed: false, hash: nextHash, path: target };
  }

  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await chmod(temporary, 0o600);
    if (options.expectedHash === null) {
      try {
        await link(temporary, target);
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw new MindosError("mindos.state.conflict", "target does not match expected baseline");
        }
        throw error;
      }
    } else {
      await rename(temporary, target);
    }
    const directory = await open(dirname(target), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error: unknown) {
    if (handle !== undefined) {
      await handle.close();
    }
    throw error instanceof MindosError
      ? error
      : new MindosError("mindos.filesystem.write_failed", "atomic write did not complete");
  } finally {
    await unlink(temporary).catch(() => undefined);
  }

  return { changed: true, hash: nextHash, path: target };
}

export async function fileHash(path: string): Promise<string | undefined> {
  try {
    await stat(path);
    return contentHash(await readFile(path));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new MindosError("mindos.filesystem.write_failed", "cannot hash target");
  }
}
