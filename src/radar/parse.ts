import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, relative as relativePath } from "node:path";
import { MindosError, resolveReadPath } from "../lib/paths.js";
import { contentHash } from "../lib/write.js";

export type RadarAction = "archive_compiled" | "compile_first" | "demote_green" | "archive_faded" | "promote_red";
export type RadarSignal = {
  page: string;
  level: "🔴" | "🟡" | "🟢";
  title: string;
  latest: string | null;
  source_dates: string[];
  compiled: boolean;
  marked: boolean;
  title_end: number;
  occurrence: number;
};
export type RadarPage = { path: string; content: string; hash: string; signals: RadarSignal[] };

const LEVEL = /^###\s+([🔴🟡🟢])[^\n]*$/gmu;
const TITLE = /^\*\*([^*\n]+)\*\*\s*$/gmu;
const LATEST = /最新信号:\s*(\d{4}-\d{2}-\d{2})/u;
const SOURCE_LINE = /^-\s*来源:\s*(.+)$/gmu;
const SOURCE_DATE = /(?<!\d)(?:(\d{4})-)?(\d{1,2})-(\d{1,2})(?!\d)/gu;
const WIKILINK = /\[\[([^|#\]]+)(?:#[^|\]]+)?(?:\|[^\]]+)?\]\]/gu;
const MARKER = /^-\s*(?:⬆️|⬇️|⚫)\s+\d{4}-\d{2}-\d{2}\s+建议/mu;

function validDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (match === null) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sourceDate(match: RegExpMatchArray, latest: string): string | undefined {
  const month = Number(match[2]); const day = Number(match[3]); let year = Number(match[1] ?? latest.slice(0, 4));
  let value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!validDate(value)) return undefined;
  if (match[1] === undefined && value > latest) {
    year -= 1; value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return validDate(value) ? value : undefined;
}

export function parseRadarPage(path: string, content: string): RadarSignal[] {
  const results: RadarSignal[] = []; const levels = [...content.matchAll(LEVEL)]; const occurrences = new Map<string, number>();
  for (const [levelIndex, levelMatch] of levels.entries()) {
    const sectionStart = (levelMatch.index ?? 0) + levelMatch[0].length;
    const sectionEnd = levels[levelIndex + 1]?.index ?? content.length;
    const section = content.slice(sectionStart, sectionEnd); const titles = [...section.matchAll(TITLE)];
    for (const [titleIndex, titleMatch] of titles.entries()) {
      const blockStart = (titleMatch.index ?? 0) + titleMatch[0].length;
      const blockEnd = titles[titleIndex + 1]?.index ?? section.length; const block = section.slice(blockStart, blockEnd);
      const rawLatest = LATEST.exec(block)?.[1]; const latest = rawLatest !== undefined && validDate(rawLatest) ? rawLatest : null;
      const dates = new Set<string>();
      if (latest !== null) {
        for (const sourceLine of block.matchAll(SOURCE_LINE)) {
          for (const match of (sourceLine[1] ?? "").matchAll(SOURCE_DATE)) {
            const parsed = sourceDate(match, latest); if (parsed !== undefined) dates.add(parsed);
          }
        }
      }
      const level = levelMatch[1] as RadarSignal["level"]; const title = (titleMatch[1] ?? "").trim(); const key = `${level}\0${title}`;
      const occurrence = occurrences.get(key) ?? 0; occurrences.set(key, occurrence + 1);
      results.push({
        page: path, level, title, latest, source_dates: [...dates].sort(), compiled: /→ 已(?:编译|记录)/u.test(block), marked: MARKER.test(block),
        title_end: sectionStart + (titleMatch.index ?? 0) + titleMatch[0].length, occurrence,
      });
    }
  }
  return results;
}

function radarPath(relative: string): void {
  if (!/^wiki\/(?!insights(?:\/|$))(?:[^/]+\/)*[^/]+\.md$/u.test(relative)) {
    throw new MindosError("mindos.filesystem.protected_path", "radar only accepts vault-relative wiki Markdown pages outside insights");
  }
}

async function readPage(root: string, relative: string): Promise<RadarPage> {
  radarPath(relative); const absolute = await resolveReadPath(root, relative);
  let metadata;
  try { metadata = await stat(absolute); } catch { throw new MindosError("mindos.input.invalid", "radar page does not exist"); }
  if (!metadata.isFile() || metadata.size > 8 * 1024 * 1024) throw new MindosError("mindos.input.invalid", "radar page is invalid or too large");
  const content = await readFile(absolute, "utf8");
  return { path: relative, content, hash: contentHash(Buffer.from(content, "utf8")), signals: parseRadarPage(relative, content) };
}

async function wikiMarkdownBasenames(root: string): Promise<Map<string, string[]>> {
  const wiki = await resolveReadPath(root, "wiki"); const matches = new Map<string, string[]>();
  try {
    const entries = (await readdir(wiki, { recursive: true, withFileTypes: true })).flatMap((entry) => {
      const relative = relativePath(wiki, join(entry.parentPath, entry.name)).replaceAll("\\", "/");
      return entry.isFile() && entry.name.endsWith(".md") && !relative.startsWith("insights/") ? [relative] : [];
    }).sort((left, right) => left.localeCompare(right));
    for (const relative of entries) {
      const name = posix.basename(relative); const path = posix.join("wiki", relative);
      const pages = matches.get(name) ?? []; pages.push(path); matches.set(name, pages);
    }
  } catch (error: unknown) {
    if (error instanceof MindosError) throw error;
    throw new MindosError("mindos.input.invalid", "radar wikilink targets cannot be resolved");
  }
  return matches;
}

function resolveBareTarget(target: string, basenames: Map<string, string[]>): string {
  const fileName = target.endsWith(".md") ? target : `${target}.md`; const matches = basenames.get(fileName) ?? [];
  if (matches.length === 0) throw new MindosError("mindos.input.invalid", `radar wikilink target does not exist: ${target}`);
  if (matches.length > 1) throw new MindosError("mindos.input.invalid", `radar wikilink target is ambiguous: ${target}`);
  return matches[0] as string;
}

export async function loadRadarPages(root: string, pages: readonly string[], hub?: string): Promise<RadarPage[]> {
  if (pages.length === 0 && hub === undefined) throw new MindosError("mindos.input.invalid", "radar prepare requires at least one page or hub");
  const resolved = [...pages];
  if (hub !== undefined) {
    const hubPage = await readPage(root, hub); let basenames: Map<string, string[]> | undefined;
    for (const match of hubPage.content.matchAll(WIKILINK)) {
      const target = (match[1] ?? "").trim();
      const withExtension = target.endsWith(".md") ? target : `${target}.md`;
      if (target.includes("/")) {
        resolved.push(withExtension);
      } else {
        basenames ??= await wikiMarkdownBasenames(root);
        resolved.push(resolveBareTarget(target, basenames));
      }
    }
  }
  const unique = [...new Set(resolved)];
  return Promise.all(unique.map(async (page) => readPage(root, page)));
}

export function daysBetween(today: string, date: string): number {
  return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
}

export function suggestionAction(signal: RadarSignal, today: string): RadarAction | undefined {
  if (signal.latest === null || signal.marked) return undefined;
  const age = daysBetween(today, signal.latest);
  if (age < 0) return undefined;
  const recent = signal.source_dates.filter((date) => { const sourceAge = daysBetween(today, date); return sourceAge >= 0 && sourceAge <= 14; });
  if (signal.level === "🟡" && recent.length >= 2) return "promote_red";
  if (age < 14) return undefined;
  if (signal.level === "🔴") return signal.compiled ? "archive_compiled" : "compile_first";
  if (signal.level === "🟡") return "demote_green";
  return "archive_faded";
}
