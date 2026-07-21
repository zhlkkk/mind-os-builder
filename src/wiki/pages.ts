import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative as relativePath } from "node:path";
import { parse } from "yaml";
import { acquireLock } from "../lib/lock.js";
import { validateMarkdown } from "../lib/input.js";
import { MindosError, resolveReadPath } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { appliedResult, blockedFromError, noopResult, previewResult, type CliResult } from "../lib/result.js";

const pagePath = /^wiki\/(?:concepts|entities|connections)\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;
const fields = new Set(["domain", "sources", "created", "updated", "tags"]);
const systemPages = new Set(["index.md", "log.md", "lint-report.md"]);

function validatePage(relative: string, content: string): void {
  if (!pagePath.test(relative)) {
    throw new MindosError("mindos.filesystem.protected_path", "page path is outside supported Wiki sections");
  }
  validateMarkdown(content);
  if (!content.startsWith("---\n")) {
    throw new MindosError("mindos.input.invalid", "page is missing YAML frontmatter");
  }
  const marker = content.indexOf("\n---\n", 4);
  if (marker < 0) {
    throw new MindosError("mindos.input.invalid", "page YAML frontmatter is not closed");
  }
  let metadata: unknown;
  try {
    metadata = parse(content.slice(4, marker));
  } catch {
    throw new MindosError("mindos.input.invalid", "page YAML frontmatter is invalid");
  }
  if (typeof metadata !== "object" || metadata === null || ![...fields].every((field) => Object.hasOwn(metadata, field))) {
    throw new MindosError("mindos.input.invalid", "page frontmatter is incomplete");
  }
}

async function optionalContent(root: string, relative: string): Promise<string | undefined> {
  const path = await resolveReadPath(root, relative);
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw new MindosError("mindos.filesystem.read_failed", "cannot read current Wiki page");
  }
}

function requireBaseline(current: string | undefined, expectedHash: string | undefined): void {
  if (current === undefined) {
    if (expectedHash !== undefined) {
      throw new MindosError("mindos.state.conflict", "page does not match expected baseline");
    }
    return;
  }
  if (expectedHash === undefined || expectedHash !== contentHash(Buffer.from(current, "utf8"))) {
    throw new MindosError("mindos.state.conflict", "page does not match expected baseline");
  }
}

function changesFor(relative: string, content: string, current: string | undefined, index: string, log: string): {
  index: string;
  log: string;
  operation: "create" | "update";
} {
  const stem = relative.slice(relative.lastIndexOf("/") + 1, -3);
  const nextIndex = index.includes(`[[${stem}]]`) ? index : `${index.trimEnd()}\n\n- [[${stem}]]\n`;
  const operation = current === undefined ? "create" : "update";
  const nextLog = `${log.trimEnd()}\n\n- ${operation === "create" ? "新增" : "更新"} [[${stem}]]（\`${relative}\`）。\n`;
  return { index: nextIndex, log: current === content && nextIndex === index ? log : nextLog, operation };
}

function ingestData(relative: string, operation: "create" | "update"): Record<string, unknown> {
  return { path: relative, operation };
}

export async function ingestWikiPage(root: string, relative: string, content: string, expectedHash: string | undefined, apply: boolean): Promise<CliResult> {
  const artifacts = [
    { kind: "page", path: relative },
    { kind: "index", path: "wiki/index.md" },
    { kind: "log", path: "wiki/log.md" },
  ];
  try {
    validatePage(relative, content);
    const current = await optionalContent(root, relative);
    if (current !== content) {
      requireBaseline(current, expectedHash);
    }
    const index = await optionalContent(root, "wiki/index.md");
    const log = await optionalContent(root, "wiki/log.md");
    if (index === undefined || log === undefined) {
      throw new MindosError("mindos.filesystem.invalid_root", "vault is missing Wiki index or log");
    }
    const changes = changesFor(relative, content, current, index, log);
    const data = ingestData(relative, changes.operation);
    if (current === content && changes.index === index) {
      return noopResult(data);
    }
    if (!apply) {
      return previewResult(data, artifacts);
    }
    const key = createHash("sha256").update(root).digest("hex").slice(0, 16);
    const lock = await acquireLock(join(root, ".mindos", "locks", `wiki-${key}.lock`));
    try {
      const currentAfterLock = await optionalContent(root, relative);
      if (currentAfterLock !== content) {
        requireBaseline(currentAfterLock, expectedHash);
      }
      const indexAfterLock = await optionalContent(root, "wiki/index.md");
      const logAfterLock = await optionalContent(root, "wiki/log.md");
      if (indexAfterLock === undefined || logAfterLock === undefined) {
        throw new MindosError("mindos.filesystem.invalid_root", "vault is missing Wiki index or log");
      }
      const changed = changesFor(relative, content, currentAfterLock, indexAfterLock, logAfterLock);
      if (currentAfterLock === content && changed.index === indexAfterLock) {
        return noopResult(ingestData(relative, changed.operation));
      }
      await atomicWrite(root, relative, content, currentAfterLock === undefined
        ? { expectedHash: null }
        : { expectedHash: contentHash(Buffer.from(currentAfterLock, "utf8")) });
      if (changed.index !== indexAfterLock) {
        await atomicWrite(root, "wiki/index.md", changed.index, { expectedHash: contentHash(Buffer.from(indexAfterLock, "utf8")) });
      }
      if (changed.log !== logAfterLock) {
        await atomicWrite(root, "wiki/log.md", changed.log, { expectedHash: contentHash(Buffer.from(logAfterLock, "utf8")) });
      }
      return appliedResult(ingestData(relative, changed.operation), artifacts);
    } finally {
      await lock.release();
    }
  } catch (error: unknown) {
    return blockedFromError(error, { path: relative });
  }
}

async function pagesAt(root: string, current = root, includeInsights = false): Promise<string[]> {
  const pages: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      if (includeInsights || entry.name !== "insights") {
        pages.push(...await pagesAt(root, path, includeInsights));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md") && (!systemPages.has(entry.name) || entry.name === "index.md")) {
      pages.push(path);
    }
  }
  return pages.sort((left, right) => left.localeCompare(right));
}

export async function queryWiki(root: string, query: string, limit: number): Promise<CliResult> {
  try {
    const needle = query.trim().toLocaleLowerCase();
    if (needle.length === 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new MindosError("mindos.input.invalid", "query and limit are invalid");
    }
    const wiki = await resolveReadPath(root, "wiki");
    const metadata = await lstat(wiki);
    if (!metadata.isDirectory()) {
      throw new MindosError("mindos.filesystem.invalid_root", "vault is missing Wiki directory");
    }
    const candidates = await pagesAt(wiki, wiki, true);
    const index = join(wiki, "index.md");
    if (candidates.includes(index)) {
      candidates.splice(candidates.indexOf(index), 1);
      candidates.unshift(index);
    }
    const matches: Array<{ path: string; excerpt: string }> = [];
    for (const path of candidates) {
      const content = await readFile(path, "utf8");
      const position = content.toLocaleLowerCase().indexOf(needle);
      if (position < 0) {
        continue;
      }
      matches.push({ path: relativePath(dirname(wiki), path).replaceAll("\\", "/"), excerpt: content.slice(Math.max(0, position - 120), position + query.length + 280).trim() });
      if (matches.length === limit) {
        break;
      }
    }
    const data = { query: query.trim(), match_count: matches.length, matches };
    return matches.length === 0 ? noopResult(data) : previewResult(data);
  } catch (error: unknown) {
    return blockedFromError(error, { query });
  }
}
