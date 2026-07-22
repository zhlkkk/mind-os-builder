import { mkdir, realpath, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readJsonInput } from "../lib/input.js";
import { MindosError } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { batchHash, type Batch, type Source } from "./model.js";

const DAY = 86_400_000;

export async function vaultKey(root: string): Promise<string> {
  return contentHash(Buffer.from(await realpath(root), "utf8")).slice(0, 24);
}

async function pathFor(root: string, id: string): Promise<string> {
  if (!/^[a-f0-9]{32}$/u.test(id)) throw new MindosError("mindos.input.invalid", "batch id is invalid");
  return join(tmpdir(), "mindos-collect", String(process.getuid?.() ?? 0), await vaultKey(root), `${id}.json`);
}

function isBatch(value: unknown): value is Batch {
  if (typeof value !== "object" || value === null) return false;
  const batch = value as Batch;
  const config = batch.config as Batch["config"] | undefined;
  return batch.version === "v1" && /^[a-f0-9]{32}$/u.test(batch.id) && (batch.source === "twitter" || batch.source === "rss")
    && /^[a-f0-9]{24}$/u.test(batch.vault) && Number.isFinite(batch.created_at) && /^[a-f0-9]{64}$/u.test(batch.baseline_hash)
    && (batch.initial_cursor === null || typeof batch.initial_cursor === "string")
    && (batch.next_cursor === null || typeof batch.next_cursor === "string")
    && Array.isArray(batch.signals) && batch.signals.every((signal) => typeof signal === "object" && signal !== null
      && /^[\w.:-]{1,256}$/u.test(signal.id) && typeof signal.title === "string" && typeof signal.content === "string"
      && typeof signal.url === "string" && typeof signal.author === "string")
    && typeof config === "object" && config !== null && typeof config.output === "string" && typeof config.filename === "string"
    && typeof config.categories === "object" && config.categories !== null && !Array.isArray(config.categories)
    && typeof config.filters === "object" && config.filters !== null;
}

export async function saveBatch(root: string, batch: Batch): Promise<void> {
  const path = await pathFor(root, batch.id);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await atomicWrite(dirname(path), `${batch.id}.json`, `${JSON.stringify(batch)}\n`, { expectedHash: null });
}

export async function loadBatch(root: string, id: string, source: Source, allowExpired = false, now = Date.now()): Promise<Batch> {
  const path = await pathFor(root, id);
  let value: unknown;
  try {
    if ((await stat(path)).size > 2 * 1024 * 1024) throw new Error();
    value = await readJsonInput(path, { maxBytes: 2 * 1024 * 1024, maxDepth: 16 });
  } catch {
    throw new MindosError("mindos.state.batch_missing", "collection batch is missing or invalid");
  }
  if (!isBatch(value) || value.source !== source || value.vault !== await vaultKey(root)) {
    throw new MindosError("mindos.state.conflict", "collection batch belongs to another vault or source");
  }
  const { baseline_hash: baseline, ...payload } = value;
  if (baseline !== batchHash(payload)) throw new MindosError("mindos.state.conflict", "collection batch baseline is invalid");
  if (!allowExpired && now - value.created_at > DAY) throw new MindosError("mindos.state.batch_expired", "collection batch has expired");
  return value;
}

export async function batchFile(root: string, id: string): Promise<string> {
  return pathFor(root, id);
}
