import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname } from "node:path";
import { MindosError } from "./paths.js";

const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000;

type LockMetadata = {
  token: string;
  pid: number;
  uid: number;
  hostname: string;
  createdAt: number;
};

export type LockOptions = {
  staleAfterMs?: number;
};

export type OperationLock = {
  token: string;
  release: () => Promise<void>;
};

function currentUid(): number | undefined {
  return typeof process.getuid === "function" ? process.getuid() : undefined;
}

function lockBlocked(): MindosError {
  return new MindosError("mindos.state.locked", "operation lock is held by another owner");
}

async function readMetadata(path: string): Promise<LockMetadata | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as LockMetadata).token === "string" &&
      Number.isInteger((parsed as LockMetadata).pid) &&
      Number.isInteger((parsed as LockMetadata).uid) &&
      typeof (parsed as LockMetadata).hostname === "string" &&
      Number.isFinite((parsed as LockMetadata).createdAt)
    ) {
      return parsed as LockMetadata;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function pidIsAlive(pid: number): boolean {
  if (pid < 1) {
    return true;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

async function reclaimIfSafe(path: string, staleAfterMs: number): Promise<boolean> {
  const owner = await readMetadata(path);
  const uid = currentUid();
  if (
    owner === undefined ||
    uid === undefined ||
    owner.uid !== uid ||
    owner.hostname !== hostname() ||
    Date.now() - owner.createdAt <= staleAfterMs ||
    pidIsAlive(owner.pid)
  ) {
    return false;
  }
  await unlink(path).catch(() => undefined);
  return true;
}

export async function acquireLock(path: string, options: LockOptions = {}): Promise<OperationLock> {
  const uid = currentUid();
  if (uid === undefined) {
    throw new MindosError("mindos.filesystem.unsupported_platform", "operation locks require a process uid");
  }
  const metadata: LockMetadata = {
    token: randomUUID(),
    pid: process.pid,
    uid,
    hostname: hostname(),
    createdAt: Date.now(),
  };
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx", 0o600);
      try {
        await handle.writeFile(JSON.stringify(metadata), "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      return {
        token: metadata.token,
        release: async () => releaseLock(path, metadata.token),
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST" || !(await reclaimIfSafe(path, staleAfterMs))) {
        throw lockBlocked();
      }
    }
  }
  throw lockBlocked();
}

export async function releaseLock(path: string, token: string): Promise<void> {
  const metadata = await readMetadata(path);
  if (metadata === undefined || metadata.token !== token) {
    throw lockBlocked();
  }
  try {
    await unlink(path);
  } catch {
    throw lockBlocked();
  }
}
