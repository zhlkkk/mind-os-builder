import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parse } from "yaml";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { resolveReadPath } from "../lib/paths.js";
import { blockedFromError, noopResult, previewResult, type CliResult } from "../lib/result.js";

const statuses = new Set(["reading", "done", "shelved"]);
const requiredProperties = ["title", "author", "status", "domain", "sources", "created", "updated", "tags"];
const baseFilters = new Set([
  'file.folder == "wiki/books"',
  'file.ext == "md"',
  'file.name != "density-tracker"',
  '!file.name.startsWith(".")',
  '!file.name.endsWith(".runtime")',
]);

type Issue = { code: string; path: string; message: string };

function isIsoDate(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function pageIssues(relative: string, content: string): Issue[] {
  const issues: Issue[] = [];
  const parsed = parseFrontmatter(content);
  if (!parsed.ok && parsed.reason === "missing") {
    return [{ code: "missing_frontmatter", path: relative, message: "缺少 YAML frontmatter" }];
  }
  if (!parsed.ok && parsed.reason === "unclosed") {
    return [{ code: "invalid_frontmatter", path: relative, message: "frontmatter 未闭合" }];
  }
  if (!parsed.ok) {
    return [{ code: "invalid_frontmatter", path: relative, message: "frontmatter 无效" }];
  }
  const metadata = parsed.metadata;
  if (typeof metadata !== "object" || metadata === null) {
    return [{ code: "invalid_frontmatter", path: relative, message: "frontmatter 必须是对象" }];
  }
  const page = metadata as Record<string, unknown>;
  for (const property of requiredProperties) {
    if (page[property] === undefined || page[property] === null || page[property] === "") {
      issues.push({ code: "missing_property", path: relative, message: `缺少属性：${property}` });
    }
  }
  if (page.status !== undefined && (typeof page.status !== "string" || !statuses.has(page.status))) {
    issues.push({ code: "invalid_status", path: relative, message: "未知阅读状态" });
  }
  for (const property of ["started", "finished", "created", "updated"]) {
    if (page[property] !== undefined && page[property] !== null && page[property] !== "" && !isIsoDate(page[property])) {
      issues.push({ code: "invalid_date", path: relative, message: `${property} 必须是 YYYY-MM-DD` });
    }
  }
  if (page.sources !== undefined && (!Number.isInteger(page.sources) || typeof page.sources !== "number" || page.sources < 0)) {
    issues.push({ code: "invalid_sources", path: relative, message: "sources 必须是非负整数" });
  }
  if (page.tags !== undefined && (!Array.isArray(page.tags) || !page.tags.every((tag) => typeof tag === "string"))) {
    issues.push({ code: "invalid_tags", path: relative, message: "tags 必须是字符串列表" });
  }
  return issues;
}

function baseIssues(relative: string, content: string): Issue[] {
  try {
    const data: unknown = parse(content);
    const expressions = typeof data === "object" && data !== null && typeof (data as { filters?: unknown }).filters === "object" && (data as { filters: { and?: unknown } }).filters !== null
      ? (data as { filters: { and?: unknown } }).filters.and
      : undefined;
    if (!Array.isArray(expressions) || !expressions.every((item) => typeof item === "string") || expressions.length !== baseFilters.size || !expressions.every((item) => baseFilters.has(item))) {
      return [{ code: "unsafe_base_filter", path: relative, message: "Base 必须严格限定 wiki/books 与 Markdown" }];
    }
    return [];
  } catch {
    return [{ code: "invalid_base", path: relative, message: "books.base 不是有效 YAML" }];
  }
}

export async function validateBooks(root: string): Promise<CliResult> {
  try {
    const books = await resolveReadPath(root, "wiki/books");
    const entries = await readdir(books, { withFileTypes: true });
    const issues: Issue[] = [];
    const base = entries.find((entry) => entry.name === "books.base");
    if (base?.isFile()) {
      issues.push(...baseIssues("wiki/books/books.base", await readFile(join(books, "books.base"), "utf8")));
    } else {
      issues.push({ code: "missing_base", path: "wiki/books/books.base", message: "缺少 books.base" });
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) {
        continue;
      }
      const relative = `wiki/books/${entry.name}`;
      if (entry.name.startsWith(".") || basename(entry.name, ".md") === "density-tracker" || basename(entry.name, ".md").endsWith(".runtime")) {
        issues.push({ code: "runtime_file_in_books", path: relative, message: "运行态 Markdown 不得进入 Book Base 目录" });
      } else {
        issues.push(...pageIssues(relative, await readFile(join(books, entry.name), "utf8")));
      }
    }
    const data = { issue_count: issues.length, issues };
    return issues.length === 0 ? noopResult(data) : previewResult(data);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return previewResult({ issue_count: 2, issues: [
        { code: "missing_base", path: "wiki/books/books.base", message: "缺少 books.base" },
        { code: "missing_books_directory", path: "wiki/books", message: "缺少 wiki/books" },
      ] });
    }
    return blockedFromError(error, {});
  }
}
