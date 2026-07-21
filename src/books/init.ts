import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { assetPath } from "../lib/assets.js";
import { acquireLock } from "../lib/lock.js";
import { MindosError, resolveReadPath, resolveWritePath } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { appliedResult, blockedFromError, noopResult, previewResult, type CliResult } from "../lib/result.js";

const indexRelative = "wiki/index.md";
const logRelative = "wiki/log.md";
const indexEntry = "- [[example-book]] — Book Base 与 RIA 示例";
const logEntry = "- 安装 Book Base 与 RIA 示例。";

type Asset = { relative: string; content: string };

async function assetsAt(root: string, current = root): Promise<Asset[]> {
  const assets: Asset[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw new MindosError("mindos.filesystem.symlink", "package Book asset contains a symbolic link");
    }
    if (entry.isDirectory()) {
      assets.push(...await assetsAt(root, path));
    } else if (entry.isFile()) {
      assets.push({ relative: path.slice(root.length + 1).replaceAll("\\", "/"), content: await readFile(path, "utf8") });
    }
  }
  return assets.sort((left, right) => left.relative.localeCompare(right.relative));
}

async function readExisting(root: string, relative: string): Promise<string | undefined> {
  const path = await resolveWritePath(root, relative);
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new MindosError("mindos.filesystem.read_failed", "cannot read existing Book asset");
  }
}

export async function initializeBooks(root: string, apply: boolean): Promise<CliResult> {
  const data = { files_planned: 0, conflicts: [] as string[] };
  try {
    const wiki = await resolveReadPath(root, "wiki");
    const index = await readFile(await resolveReadPath(root, indexRelative), "utf8");
    const log = await readFile(await resolveReadPath(root, logRelative), "utf8");
    if (wiki.length === 0) {
      throw new MindosError("mindos.filesystem.invalid_root", "vault is missing Wiki directory");
    }
    const assets = await assetsAt(join(assetPath("data"), "books"));
    const missing: Asset[] = [];
    for (const asset of assets) {
      const existing = await readExisting(root, asset.relative);
      if (existing === undefined) {
        missing.push(asset);
      } else if (existing !== asset.content) {
        data.conflicts.push(asset.relative);
      }
    }
    const nextIndex = index.includes(indexEntry) ? index : `${index.trimEnd()}\n\n## 书籍\n\n${indexEntry}\n`;
    const nextLog = log.includes(logEntry) ? log : `${log.trimEnd()}\n${logEntry}\n`;
    data.files_planned = missing.length;
    const artifacts: CliResult["artifacts"] = [
      ...missing.map((asset) => ({ kind: "book_asset", path: asset.relative })),
      ...(nextIndex === index ? [] : [{ kind: "index", path: indexRelative }]),
      ...(nextLog === log ? [] : [{ kind: "log", path: logRelative }]),
    ];
    if (artifacts.length === 0) {
      return noopResult(data);
    }
    if (!apply) {
      return previewResult(data, artifacts);
    }
    const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
    const lock = await acquireLock(join(root, ".mindos", "locks", `books-${key}.lock`));
    try {
      const indexAfterLock = await readFile(await resolveReadPath(root, indexRelative), "utf8");
      const logAfterLock = await readFile(await resolveReadPath(root, logRelative), "utf8");
      for (const asset of missing) {
        const existing = await readExisting(root, asset.relative);
        if (existing === undefined) {
          await atomicWrite(root, asset.relative, asset.content, { expectedHash: null });
        } else if (existing !== asset.content && !data.conflicts.includes(asset.relative)) {
          data.conflicts.push(asset.relative);
        }
      }
      const indexToWrite = indexAfterLock.includes(indexEntry) ? indexAfterLock : `${indexAfterLock.trimEnd()}\n\n## 书籍\n\n${indexEntry}\n`;
      const logToWrite = logAfterLock.includes(logEntry) ? logAfterLock : `${logAfterLock.trimEnd()}\n${logEntry}\n`;
      if (indexToWrite !== indexAfterLock) {
        await atomicWrite(root, indexRelative, indexToWrite, { expectedHash: contentHash(Buffer.from(indexAfterLock, "utf8")) });
      }
      if (logToWrite !== logAfterLock) {
        await atomicWrite(root, logRelative, logToWrite, { expectedHash: contentHash(Buffer.from(logAfterLock, "utf8")) });
      }
      return appliedResult(data, artifacts);
    } finally {
      await lock.release();
    }
  } catch (error: unknown) {
    return blockedFromError(error, data);
  }
}
