import { readFile, stat, unlink } from "node:fs/promises";
import { acquireVaultLock } from "../lib/lock.js";
import { MindosError, resolveReadPath, resolveWritePath } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { type RadarDecisionInput, validateRadarDecisionCoverage } from "./decisions.js";
import { parseRadarPage } from "./parse.js";
import { loadRadarBatch, radarBatchFile, type RadarSuggestion } from "./prepare.js";

type ReceiptPage = { path: string; baseline_hash: string; target_hash: string };
type Receipt = { version: "v1"; batch_id: string; decision_hash: string; reserved_at: number; phase: "reserved" | "applied"; pages: ReceiptPage[] };
type StoredReceipt = { receipt: Receipt; hash: string };
export type RadarCommitOutcome = { changed: boolean; data: Record<string, unknown>; artifacts: Array<{ kind: string; path: string }> };

const MARKERS: Record<RadarSuggestion["action"], string> = {
  archive_compiled: "⚫ {today} 建议移入已编译归档",
  compile_first: "⬆️ {today} 建议优先补编译",
  demote_green: "⬇️ {today} 建议降级 → 🟢",
  archive_faded: "⚫ {today} 建议进入消退归档",
  promote_red: "⬆️ {today} 建议升级 → 🔴",
};

async function boundedRead(path: string): Promise<string> {
  if ((await stat(path)).size > 8 * 1024 * 1024) throw new MindosError("mindos.state.conflict", "radar page is too large");
  return readFile(path, "utf8");
}

async function readReceipt(root: string, id: string): Promise<StoredReceipt | undefined> {
  const path = await resolveReadPath(root, `.mindos/radar/receipts/${id}.json`);
  try {
    const content = await boundedRead(path); const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    const receipt = parsed as Receipt;
    if (receipt.version !== "v1" || receipt.batch_id !== id || !/^[a-f0-9]{64}$/u.test(receipt.decision_hash)
      || !Number.isFinite(receipt.reserved_at) || (receipt.phase !== "reserved" && receipt.phase !== "applied") || !Array.isArray(receipt.pages)
      || receipt.pages.some((page) => typeof page.path !== "string" || !/^[a-f0-9]{64}$/u.test(page.baseline_hash) || !/^[a-f0-9]{64}$/u.test(page.target_hash))) throw new Error();
    return { receipt, hash: contentHash(Buffer.from(content, "utf8")) };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new MindosError("mindos.state.conflict", "radar receipt is invalid");
  }
}

async function writeReceipt(root: string, receipt: Receipt, expectedHash: string | null): Promise<string> {
  const outcome = await atomicWrite(root, `.mindos/radar/receipts/${receipt.batch_id}.json`, `${JSON.stringify(receipt)}\n`, { expectedHash });
  return outcome.hash;
}

function sameSuggestion(signal: ReturnType<typeof parseRadarPage>[number], suggestion: RadarSuggestion): boolean {
  return signal.page === suggestion.page && signal.level === suggestion.level && signal.title === suggestion.title
    && signal.latest === suggestion.latest && signal.occurrence === suggestion.occurrence;
}

function renderPage(content: string, page: string, suggestions: readonly RadarSuggestion[], today: string): string {
  const signals = parseRadarPage(page, content); const insertions: Array<{ offset: number; marker: string }> = [];
  for (const suggestion of suggestions) {
    const signal = signals.find((item) => sameSuggestion(item, suggestion));
    if (signal === undefined || signal.marked) throw new MindosError("mindos.state.conflict", "radar suggestion no longer matches its page");
    insertions.push({ offset: signal.title_end, marker: `\n- ${MARKERS[suggestion.action].replace("{today}", today)}` });
  }
  let updated = content;
  for (const insertion of insertions.sort((left, right) => right.offset - left.offset)) {
    updated = updated.slice(0, insertion.offset) + insertion.marker + updated.slice(insertion.offset);
  }
  return updated.replace(/^(updated:\s*)\d{4}-\d{2}-\d{2}\s*$/mu, `$1${today}`);
}

async function currentPage(root: string, relative: string): Promise<{ content: string; hash: string }> {
  if (!/^wiki\/(?!insights(?:\/|$))(?:[^/]+\/)*[^/]+\.md$/u.test(relative)) throw new MindosError("mindos.filesystem.protected_path", "radar batch contains an invalid page");
  const path = await resolveWritePath(root, relative); const content = await boundedRead(path);
  return { content, hash: contentHash(Buffer.from(content, "utf8")) };
}

async function validateReplay(root: string, receipt: Receipt): Promise<void> {
  for (const page of receipt.pages) {
    if ((await currentPage(root, page.path)).hash !== page.target_hash) throw new MindosError("mindos.state.conflict", "radar page changed after commit");
  }
}

async function execute(root: string, input: RadarDecisionInput, apply: boolean, now: number): Promise<RadarCommitOutcome> {
  const decisionHash = contentHash(Buffer.from(JSON.stringify(input), "utf8")); const stored = await readReceipt(root, input.batch_id);
  if (stored !== undefined && (stored.receipt.decision_hash !== decisionHash || now - stored.receipt.reserved_at > 30 * 86_400_000)) {
    throw new MindosError("mindos.state.conflict", "radar receipt does not match this commit");
  }
  if (stored?.receipt.phase === "applied") {
    await validateReplay(root, stored.receipt);
    return { changed: false, data: { batch_id: input.batch_id, replay: true }, artifacts: [] };
  }
  const batch = await loadRadarBatch(root, input.batch_id, stored !== undefined, now); const decisions = validateRadarDecisionCoverage(batch, input);
  const approved = batch.suggestions.filter((item) => decisions.get(item.suggestion_id)?.decision === "approve");
  const data = { batch_id: batch.id, baseline_hash: batch.baseline_hash, suggestion_count: batch.suggestions.length, approved: approved.length, rejected: batch.suggestions.length - approved.length };
  if (approved.length === 0) return { changed: false, data, artifacts: [] };

  const receiptPages = new Map(stored?.receipt.pages.map((page) => [page.path, page]) ?? []); const pageUpdates: Array<{ page: string; content: string; currentHash: string; targetHash: string }> = [];
  for (const baseline of batch.pages) {
    const selected = approved.filter((item) => item.page === baseline.path); if (selected.length === 0) continue;
    const current = await currentPage(root, baseline.path); const reserved = receiptPages.get(baseline.path);
    if (reserved !== undefined && current.hash === reserved.target_hash) continue;
    if (current.hash !== baseline.hash) throw new MindosError("mindos.state.conflict", "radar page changed after prepare");
    const content = renderPage(current.content, baseline.path, selected, batch.today);
    pageUpdates.push({ page: baseline.path, content, currentHash: current.hash, targetHash: contentHash(Buffer.from(content, "utf8")) });
  }
  const artifacts = approved.length === 0 ? [] : [...new Set(approved.map((item) => item.page))].map((path) => ({ kind: "radar_page", path }));
  if (!apply) return { changed: pageUpdates.length > 0, data, artifacts };

  let receipt = stored?.receipt;
  let receiptHash = stored?.hash ?? null;
  if (receipt === undefined) {
    receipt = {
      version: "v1", batch_id: batch.id, decision_hash: decisionHash, reserved_at: now, phase: "reserved",
      pages: pageUpdates.map((item) => ({ path: item.page, baseline_hash: item.currentHash, target_hash: item.targetHash })),
    };
    receiptHash = await writeReceipt(root, receipt, null);
  }
  for (const update of pageUpdates) await atomicWrite(root, update.page, update.content, { expectedHash: update.currentHash });
  receipt.phase = "applied"; await writeReceipt(root, receipt, receiptHash);
  await unlink(await radarBatchFile(root, batch.id)).catch(() => undefined);
  return { changed: pageUpdates.length > 0, data, artifacts };
}

export async function commitRadar(root: string, input: RadarDecisionInput, apply: boolean, now = Date.now()): Promise<RadarCommitOutcome> {
  if (!apply) return execute(root, input, false, now);
  const lock = await acquireVaultLock(root, ".mindos/locks/radar-commit.lock");
  try { return await execute(root, input, true, now); } finally { await lock.release(); }
}
