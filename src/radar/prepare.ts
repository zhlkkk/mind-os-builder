import { randomUUID } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readJsonInput } from "../lib/input.js";
import { MindosError } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { daysBetween, loadRadarPages, suggestionAction, type RadarAction } from "./parse.js";

const DAY = 86_400_000;
export type RadarSuggestion = { suggestion_id: string; page: string; level: string; title: string; latest: string; age_days: number; action: RadarAction; occurrence: number };
export type RadarBatch = {
  version: "v1"; id: string; vault: string; created_at: number; today: string;
  pages: Array<{ path: string; hash: string }>; suggestions: RadarSuggestion[]; baseline_hash: string;
};
export type RadarPrepareOutcome = { batch: RadarBatch; diagnostics: Array<{ page: string; title: string; status: string }> };

function validToday(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function radarVaultKey(root: string): Promise<string> {
  try {
    return contentHash(Buffer.from(await realpath(root), "utf8")).slice(0, 24);
  } catch {
    throw new MindosError("mindos.filesystem.invalid_root", "vault root must exist");
  }
}

function suggestionId(page: string, level: string, title: string, latest: string, action: RadarAction, occurrence: number): string {
  return `radar:v1:${contentHash(Buffer.from(`v1\0${page}\0${level}\0${title}\0${latest}\0${action}\0${String(occurrence)}`, "utf8")).slice(0, 20)}`;
}

export function radarBatchHash(batch: Omit<RadarBatch, "baseline_hash">): string {
  return contentHash(Buffer.from(JSON.stringify(batch), "utf8"));
}

async function batchPath(root: string, id: string): Promise<string> {
  if (!/^[a-f0-9]{32}$/u.test(id)) throw new MindosError("mindos.input.invalid", "radar batch id is invalid");
  return join(tmpdir(), "mindos-radar", String(process.getuid?.() ?? 0), await radarVaultKey(root), `${id}.json`);
}

export async function radarBatchFile(root: string, id: string): Promise<string> {
  return batchPath(root, id);
}

function isBatch(value: unknown): value is RadarBatch {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const batch = value as RadarBatch;
  return batch.version === "v1" && /^[a-f0-9]{32}$/u.test(batch.id) && /^[a-f0-9]{24}$/u.test(batch.vault)
    && Number.isFinite(batch.created_at) && validToday(batch.today) && /^[a-f0-9]{64}$/u.test(batch.baseline_hash)
    && Array.isArray(batch.pages) && batch.pages.length <= 256 && batch.pages.every((page) => typeof page.path === "string" && /^[a-f0-9]{64}$/u.test(page.hash))
    && Array.isArray(batch.suggestions) && batch.suggestions.length <= 500 && batch.suggestions.every((item) =>
      /^radar:v1:[a-f0-9]{20}$/u.test(item.suggestion_id) && typeof item.page === "string" && typeof item.title === "string"
      && typeof item.latest === "string" && Number.isInteger(item.age_days) && Number.isInteger(item.occurrence)
      && ["archive_compiled", "compile_first", "demote_green", "archive_faded", "promote_red"].includes(item.action));
}

export async function prepareRadar(root: string, pages: readonly string[], hub: string | undefined, today: string, now = Date.now()): Promise<RadarPrepareOutcome> {
  if (!validToday(today)) throw new MindosError("mindos.input.invalid", "radar date must use YYYY-MM-DD");
  const loaded = await loadRadarPages(root, pages, hub); const diagnostics: RadarPrepareOutcome["diagnostics"] = []; const suggestions: RadarSuggestion[] = [];
  for (const page of loaded) {
    for (const signal of page.signals) {
      const status = signal.latest === null ? "missing_date" : daysBetween(today, signal.latest) < 0 ? "future_date" : signal.marked ? "already_marked" : undefined;
      if (status !== undefined) diagnostics.push({ page: page.path, title: signal.title, status });
      const action = suggestionAction(signal, today);
      if (action !== undefined && signal.latest !== null) suggestions.push({
        suggestion_id: suggestionId(page.path, signal.level, signal.title, signal.latest, action, signal.occurrence),
        page: page.path, level: signal.level, title: signal.title, latest: signal.latest,
        age_days: daysBetween(today, signal.latest), action, occurrence: signal.occurrence,
      });
    }
  }
  suggestions.sort((left, right) => left.page.localeCompare(right.page) || left.title.localeCompare(right.title) || left.suggestion_id.localeCompare(right.suggestion_id));
  const id = randomUUID().replaceAll("-", "");
  const payload: Omit<RadarBatch, "baseline_hash"> = {
    version: "v1", id, vault: await radarVaultKey(root), created_at: now, today,
    pages: loaded.map((page) => ({ path: page.path, hash: page.hash })).sort((left, right) => left.path.localeCompare(right.path)), suggestions,
  };
  const batch: RadarBatch = { ...payload, baseline_hash: radarBatchHash(payload) };
  const path = await batchPath(root, id); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await atomicWrite(dirname(path), `${id}.json`, `${JSON.stringify(batch)}\n`, { expectedHash: null });
  return { batch, diagnostics };
}

export async function loadRadarBatch(root: string, id: string, allowExpired = false, now = Date.now()): Promise<RadarBatch> {
  const path = await batchPath(root, id); let value: unknown;
  try {
    if ((await stat(path)).size > 2 * 1024 * 1024) throw new Error();
    value = await readJsonInput(path, { maxBytes: 2 * 1024 * 1024, maxDepth: 12 });
  } catch {
    throw new MindosError("mindos.state.batch_missing", "radar batch is missing or invalid");
  }
  if (!isBatch(value) || value.vault !== await radarVaultKey(root)) throw new MindosError("mindos.state.conflict", "radar batch belongs to another vault");
  const { baseline_hash: baseline, ...payload } = value;
  if (baseline !== radarBatchHash(payload)) throw new MindosError("mindos.state.conflict", "radar batch baseline is invalid");
  if (!allowExpired && now - value.created_at > DAY) throw new MindosError("mindos.state.batch_expired", "radar batch has expired");
  return value;
}
