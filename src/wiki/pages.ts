import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative as relativePath } from "node:path";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { acquireVaultLock } from "../lib/lock.js";
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
  const parsed = parseFrontmatter(content);
  if (!parsed.ok && parsed.reason === "missing") {
    throw new MindosError("mindos.input.invalid", "page is missing YAML frontmatter");
  }
  if (!parsed.ok && parsed.reason === "unclosed") {
    throw new MindosError("mindos.input.invalid", "page YAML frontmatter is not closed");
  }
  if (!parsed.ok) {
    throw new MindosError("mindos.input.invalid", "page YAML frontmatter is invalid");
  }
  const metadata = parsed.metadata;
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
    const key = contentHash(Buffer.from(root, "utf8")).slice(0, 16);
    const lock = await acquireVaultLock(root, `.mindos/locks/wiki-${key}.lock`);
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

async function pagesAt(root: string, includeInsights = false): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true })).flatMap((entry) => {
    const path = join(entry.parentPath, entry.name); const relative = relativePath(root, path).replaceAll("\\", "/");
    const excluded = !includeInsights && relative.split("/").slice(0, -1).includes("insights");
    return entry.isFile() && entry.name.endsWith(".md") && !excluded
      && (!systemPages.has(entry.name) || entry.name === "index.md") ? [path] : [];
  }).sort((left, right) => left.localeCompare(right));
}

export async function queryWiki(root: string, query: string, limit: number): Promise<CliResult> {
  try {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new MindosError("mindos.input.invalid", "query and limit are invalid");
    }
    const wiki = await resolveReadPath(root, "wiki");
    const metadata = await lstat(wiki);
    if (!metadata.isDirectory()) {
      throw new MindosError("mindos.filesystem.invalid_root", "vault is missing Wiki directory");
    }
    const candidates = await pagesAt(wiki, true);
    const index = join(wiki, "index.md");
    if (candidates.includes(index)) {
      candidates.splice(candidates.indexOf(index), 1);
      candidates.unshift(index);
    }
    const matches: Array<{ path: string; excerpt: string }> = [];
    for (const path of candidates) {
      const content = await readFile(path, "utf8");
      const position = content.toLowerCase().indexOf(needle);
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
