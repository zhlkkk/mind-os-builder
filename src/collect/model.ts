import { readFile, stat } from "node:fs/promises";
import { parse } from "yaml";
import { validateHttpUrl, validateMarkdown } from "../lib/input.js";
import { MindosError, resolveReadPath } from "../lib/paths.js";
import { contentHash } from "../lib/write.js";

export type Source = "twitter" | "rss";
export type Signal = { id: string; title: string; content: string; url: string; author: string };
export type Filters = { include: string[]; exclude: string[]; weights: Record<string, number>; minimum: number; limit: number };
export type CollectConfig = { output: string; filename: string; categories: Record<string, string>; filters: Filters; markReadAfterCommit?: boolean };
export type Batch = {
  version: "v1"; id: string; vault: string; source: Source; created_at: number; baseline_hash: string;
  initial_cursor: string | null; next_cursor: string | null; signals: Signal[]; config: CollectConfig;
};
export type Decision = {
  id: string; decision: "keep" | "discard"; reason: string; display_title?: string;
  display_summary?: string; translated?: boolean; category?: string; tags?: string[];
};

const defaults = { "agent-systems": "Agent 系统", "models-research": "模型与研究", "developer-tools": "开发工具", "products-practice": "产品与实践", other: "其他" };
const scalar = (value: unknown): string => typeof value === "string" || typeof value === "number" ? String(value) : "";
const text = (value: unknown, limit: number): string => validateMarkdown(scalar(value).trim(), limit);

export function normalizeProvider(source: Source, value: unknown): { signals: Signal[]; cursor: string | null } {
  const object = typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  const records = Array.isArray(value) ? value : [object.records, object.items, object.entries, object.data].find(Array.isArray);
  if (!Array.isArray(records) || records.length > 500) {
    throw new MindosError("mindos.provider.invalid_output", "provider records are invalid");
  }
  const signals = records.map((item): Signal => {
    const record = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    const title = text(record.title ?? record.text ?? record.content ?? record.summary, 4_000);
    const content = text(record.text ?? record.content ?? record.summary, 64_000);
    const author = text(record.author, 1_000);
    const url = validateHttpUrl(scalar(record.url ?? record.link)).toString();
    const rawId = scalar(record.id ?? record.guid).trim();
    const id = rawId || contentHash(Buffer.from(`${source}\0${url}\0${title}`, "utf8")).slice(0, 24);
    if (!/^[\w.:-]{1,256}$/u.test(id) || title.length === 0) {
      throw new MindosError("mindos.provider.invalid_output", "provider signal is invalid");
    }
    return { id, title, content, url, author };
  });
  if (new Set(signals.map((signal) => signal.id)).size !== signals.length) {
    throw new MindosError("mindos.provider.invalid_output", "provider signal ids are duplicated");
  }
  const cursor = object.next_cursor ?? object.cursor;
  return { signals, cursor: typeof cursor === "string" && cursor.length <= 4_096 ? cursor : null };
}

const strings = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string").map((item) => item.toLowerCase())
  : [];

export async function loadCollectConfig(root: string, source: Source): Promise<CollectConfig> {
  const path = await resolveReadPath(root, ".mindos/config.yaml");
  if ((await stat(path)).size > 256 * 1024) throw new MindosError("mindos.input.invalid", "collection config is too large");
  const parsed: unknown = parse(await readFile(path, "utf8"));
  const top = typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
  const collect = typeof top.collect === "object" && top.collect !== null ? top.collect as Record<string, unknown> : {};
  const raw = typeof collect[source] === "object" && collect[source] !== null ? collect[source] as Record<string, unknown> : {};
  const filter = typeof raw.filters === "object" && raw.filters !== null ? raw.filters as Record<string, unknown> : {};
  const rawCategories = typeof raw.categories === "object" && raw.categories !== null ? raw.categories as Record<string, unknown> : defaults;
  const categories = Object.fromEntries(Object.entries(rawCategories).map(([key, value]) => [key, text(value, 200)]));
  if (Object.keys(categories).length === 0 || Object.entries(categories).some(([key, label]) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(key)
    || label.length === 0 || /[\r\n]/u.test(label) || label.includes("<!--"))) {
    throw new MindosError("mindos.input.invalid", "collection categories are invalid");
  }
  const output = raw.output_directory === undefined ? `raw/${source}` : scalar(raw.output_directory);
  if (!/^raw\/[a-z0-9][a-z0-9/-]*$/u.test(output) || output.includes("..")) {
    throw new MindosError("mindos.filesystem.protected_path", "collection output must be a raw vault-relative directory");
  }
  const defaultFilename = source === "twitter" ? "{date}-X精选信息简报.md" : "{date}-Folo精选信息简报.md";
  const filename = raw.daily_filename === undefined ? defaultFilename : scalar(raw.daily_filename);
  if (filename.length > 200 || !filename.endsWith(".md") || filename.split("{date}").length !== 2
    || /[\\/\r\n\0]/u.test(filename) || filename.includes("..") || filename.includes("<!--")) {
    throw new MindosError("mindos.input.invalid", "collection daily filename is invalid");
  }
  const weights = typeof filter.weights === "object" && filter.weights !== null
    ? Object.fromEntries(Object.entries(filter.weights as Record<string, unknown>).map(([key, value]) => [key.toLowerCase(), Number(value)])) : {};
  const minimum = Number(filter.minimum_score ?? 0); const limit = Number(filter.output_limit ?? 50);
  if (!Number.isFinite(minimum) || !Number.isInteger(limit) || limit < 0 || limit > 200 || Object.values(weights).some((value) => !Number.isFinite(value))) {
    throw new MindosError("mindos.input.invalid", "collection filters are invalid");
  }
  if (source === "rss" && raw.mark_read_after_commit !== undefined && typeof raw.mark_read_after_commit !== "boolean") {
    throw new MindosError("mindos.input.invalid", "RSS mark_read_after_commit must be boolean");
  }
  const markReadAfterCommit = source === "rss" && raw.mark_read_after_commit === true;
  return { output, filename, categories, filters: { include: strings(filter.include_any), exclude: strings(filter.exclude_any), weights, minimum, limit }, markReadAfterCommit };
}

export function filterSignals(signals: Signal[], filters: Filters): { signals: Signal[]; rejected: Record<string, number> } {
  const rejected: Record<string, number> = { excluded: 0, not_included: 0, below_score: 0, limited: 0 };
  const accepted = signals.filter((signal) => {
    const searchable = `${signal.title}\n${signal.content}\n${signal.author}`.toLowerCase();
    if (filters.exclude.some((term) => searchable.includes(term))) { rejected.excluded = (rejected.excluded ?? 0) + 1; return false; }
    if (filters.include.length > 0 && !filters.include.some((term) => searchable.includes(term))) { rejected.not_included = (rejected.not_included ?? 0) + 1; return false; }
    const score = Object.entries(filters.weights).reduce((total, [term, weight]) => total + (searchable.includes(term) ? weight : 0), 0);
    if (score < filters.minimum) { rejected.below_score = (rejected.below_score ?? 0) + 1; return false; }
    return true;
  });
  rejected.limited = Math.max(0, accepted.length - filters.limit);
  return { signals: accepted.slice(0, filters.limit), rejected };
}

export function batchHash(batch: Omit<Batch, "baseline_hash">): string {
  return contentHash(Buffer.from(JSON.stringify(batch), "utf8"));
}
