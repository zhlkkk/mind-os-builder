import { lstat, readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, relative as relativePath } from "node:path";
import { parse } from "yaml";
import { MindosError, resolveReadPath } from "../lib/paths.js";
import { blockedFromError, noopResult, previewResult, type CliResult } from "../lib/result.js";

const requiredFields = new Set(["domain", "sources", "created", "updated", "tags"]);
const systemFiles = new Set(["index.md", "log.md", "lint-report.md"]);
const wikilink = /\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/gu;

type Issue = { code: string; path: string; message: string; level: "error" | "warning" };

async function pagesAt(root: string, current = root): Promise<string[]> {
  const pages: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      if (entry.name !== "insights") {
        pages.push(...await pagesAt(root, path));
      }
    } else if (entry.isFile() && entry.name.endsWith(".md") && !systemFiles.has(entry.name)) {
      pages.push(path);
    }
  }
  return pages.sort((left, right) => left.localeCompare(right));
}

function frontmatter(content: string): Record<string, unknown> | undefined {
  if (!content.startsWith("---\n")) {
    return undefined;
  }
  const marker = content.indexOf("\n---\n", 4);
  if (marker < 0) {
    return undefined;
  }
  try {
    const parsed: unknown = parse(content.slice(4, marker));
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export async function lintWiki(root: string): Promise<CliResult> {
  try {
    const wiki = await resolveReadPath(root, "wiki");
    if (!(await lstat(wiki)).isDirectory()) {
      throw new MindosError("mindos.filesystem.invalid_root", "vault is missing Wiki directory");
    }
    const indexPath = join(wiki, "index.md");
    const index = await readFile(indexPath, "utf8").catch(() => "");
    const pages = await pagesAt(wiki);
    const known = new Set(pages.map((path) => basename(path, ".md")));
    const inbound = new Map([...known].map((name) => [name, 0]));
    const issues: Issue[] = [];
    for (const page of pages) {
      const relative = relativePath(dirname(wiki), page).replaceAll("\\", "/");
      const content = await readFile(page, "utf8");
      const metadata = frontmatter(content);
      if (metadata === undefined) {
        issues.push({ code: "frontmatter_missing", path: relative, message: "missing YAML frontmatter", level: "error" });
      } else {
        const missing = [...requiredFields].filter((field) => !Object.hasOwn(metadata, field));
        if (missing.length > 0) {
          issues.push({ code: "frontmatter_incomplete", path: relative, message: `missing fields: ${missing.join(", ")}`, level: "error" });
        }
      }
      if (content.split("\n").length > 500) {
        issues.push({ code: "page_too_long", path: relative, message: "page exceeds 500 lines", level: "warning" });
      }
      const stem = basename(page, ".md");
      if (!index.includes(`[[${stem}]]`)) {
        issues.push({ code: "index_missing", path: relative, message: "page is absent from wiki/index.md", level: "error" });
      }
      for (const match of content.matchAll(wikilink)) {
        const target = match[1]?.trim() ?? "";
        if (target.startsWith("raw/") || target.startsWith("journals/")) {
          continue;
        }
        const targetStem = basename(target);
        if (known.has(targetStem)) {
          inbound.set(targetStem, (inbound.get(targetStem) ?? 0) + 1);
        } else {
          issues.push({ code: "red_link", path: relative, message: `missing target: ${target}`, level: "warning" });
        }
      }
    }
    for (const [stem, count] of inbound) {
      if (count === 0 && !index.includes(`[[${stem}]]`)) {
        issues.push({ code: "orphan_page", path: stem, message: "page has no inbound links", level: "warning" });
      }
    }
    const data = { error_count: issues.filter((issue) => issue.level === "error").length, issues, protected_paths: ["wiki/insights", "raw/logseq-import"] };
    return issues.length === 0 ? noopResult(data) : previewResult(data);
  } catch (error: unknown) {
    return blockedFromError(error, {});
  }
}
