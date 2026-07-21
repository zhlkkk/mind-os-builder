import { readFile, stat, unlink } from "node:fs/promises";
import { parseContract } from "../lib/contracts.js";
import { acquireVaultLock } from "../lib/lock.js";
import { MindosError, resolveReadPath, resolveWritePath } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { batchFile, loadBatch } from "./batch.js";
import type { Batch, Decision, Source } from "./model.js";

type Phase = "reserved" | "output" | "seen" | "cursor" | "applied";
type Receipt = { source: Source; decision_hash: string; date: string; target: string; phase: Phase; reserved_at: number; output_hash?: string };
type JsonState = { value: Record<string, unknown>; hash: string | null };
export type DecisionInput = { version: "v1"; batch_id: string; baseline_hash: string; decisions: Decision[] };
export type CommitOptions = { apply: boolean; now?: number; afterPhase?: (phase: Phase) => void | Promise<void> };
export type CommitOutcome = { changed: boolean; target?: string; data: Record<string, unknown>; artifacts: Array<{ kind: string; path: string }> };

async function boundedRead(path: string, maxBytes: number): Promise<string> {
  if ((await stat(path)).size > maxBytes) throw new MindosError("mindos.state.conflict", "collection file is too large");
  return readFile(path, "utf8");
}

async function readState(root: string, name: string): Promise<JsonState> {
  const path = await resolveReadPath(root, `.mindos/collect/${name}.json`);
  try {
    const content = await boundedRead(path, 2 * 1024 * 1024);
    const value: unknown = JSON.parse(content);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return { value: value as Record<string, unknown>, hash: contentHash(Buffer.from(content, "utf8")) };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { value: {}, hash: null };
    throw new MindosError("mindos.state.conflict", "collection state is invalid");
  }
}

async function writeState(root: string, name: string, state: JsonState): Promise<void> {
  const outcome = await atomicWrite(root, `.mindos/collect/${name}.json`, `${JSON.stringify(state.value, null, 2)}\n`, { expectedHash: state.hash });
  state.hash = outcome.hash;
}

const inline = (value: string, limit = 4_000): string => value.slice(0, limit).replace(/[\r\n]+/gu, " ").replace(/([\\`*_[\]<>])/gu, "\\$1");
const markdownDestination = (value: string): string => `<${value.replace(/[()[\]<>\\\s]/gu, (character) =>
  [...Buffer.from(character, "utf8")].map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`).join(""))}>`;
const marker = (source: Source, id: string): string => `<!-- mindos:collect:${source}:${id} -->`;

function validateDecisions(batch: Batch, input: DecisionInput): Map<string, Decision> {
  if (input.baseline_hash !== batch.baseline_hash || input.decisions.length !== batch.signals.length) {
    throw new MindosError("mindos.input.invalid", "decisions do not match the collection batch");
  }
  const expected = new Set(batch.signals.map((signal) => signal.id)); const decisions = new Map<string, Decision>();
  for (const decision of input.decisions) {
    const keep = decision.decision === "keep";
    if (!expected.has(decision.id) || decisions.has(decision.id) || decision.reason.trim().length === 0 || decision.reason.length > 2_000) {
      throw new MindosError("mindos.input.invalid", "collection decisions are invalid");
    }
    if (keep && (decision.display_title?.trim() === "" || (decision.display_title?.length ?? 0) > 500
      || decision.display_summary?.trim() === "" || (decision.display_summary?.length ?? 0) > 4_000
      || decision.category === undefined || !(decision.category in batch.config.categories)
      || decision.tags?.some((tag) => tag.trim() === "" || tag.length > 80))) {
      throw new MindosError("mindos.input.invalid", "collection decision display fields are invalid");
    }
    decisions.set(decision.id, decision);
  }
  return decisions;
}

async function readDaily(root: string, relative: string): Promise<{ content: string; hash: string | null }> {
  const path = await resolveWritePath(root, relative);
  try {
    const content = await boundedRead(path, 8 * 1024 * 1024); return { content, hash: contentHash(Buffer.from(content, "utf8")) };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { content: "", hash: null };
    throw error;
  }
}

function renderDaily(batch: Batch, decisions: Map<string, Decision>, date: string, existing: string): string {
  const additions = batch.signals.filter((signal) => decisions.get(signal.id)?.decision === "keep" && !existing.includes(marker(batch.source, signal.id)));
  if (additions.length === 0) return existing;
  let output = existing || `# ${date} ${batch.source === "twitter" ? "Twitter" : "RSS"} 简报\n`;
  for (const [category, label] of Object.entries(batch.config.categories)) {
    const grouped = additions.filter((signal) => decisions.get(signal.id)?.category === category);
    if (grouped.length === 0) continue;
    output = `${output.trimEnd()}\n\n## ${inline(label, 200)}\n`;
    for (const signal of grouped) {
      const decision = decisions.get(signal.id) as Decision;
      output += `\n${marker(batch.source, signal.id)}\n### ${inline(decision.display_title ?? signal.title, 500)}\n\n${inline(decision.display_summary ?? "")}\n\n- 来源：[${inline(signal.title, 500)}](${markdownDestination(signal.url)})`;
      if (decision.translated) output += `\n- 原文：${inline(signal.title, 500)} — ${inline(signal.content, 1_000)}`;
      if ((decision.tags?.length ?? 0) > 0) output += `\n- 标签：${decision.tags?.map((tag) => `#${inline(tag, 80)}`).join(" ")}`;
      output += "\n";
    }
  }
  return output;
}

async function setReceipt(root: string, state: JsonState, id: string, receipt: Receipt, phase: Phase, hook?: CommitOptions["afterPhase"]): Promise<void> {
  receipt.phase = phase; state.value[id] = receipt; await writeState(root, "receipts", state); await hook?.(phase);
}

export async function commitCollection(root: string, source: Source, value: unknown, options: CommitOptions): Promise<CommitOutcome> {
  const input = parseContract<DecisionInput>("collectionDecisions", value, "collection decisions are invalid");
  const now = options.now ?? Date.now(); const decisionHash = contentHash(Buffer.from(JSON.stringify(input), "utf8"));
  const lock = await acquireVaultLock(root, `.mindos/locks/collect-${source}.lock`);
  try {
    const receipts = await readState(root, "receipts"); const rawReceipt = receipts.value[input.batch_id];
    const receipt = typeof rawReceipt === "object" && rawReceipt !== null ? rawReceipt as Receipt : undefined;
    if (receipt !== undefined && (receipt.source !== source || receipt.decision_hash !== decisionHash || now - receipt.reserved_at > 30 * 86_400_000)) {
      throw new MindosError("mindos.state.conflict", "collection receipt does not match this commit");
    }
    if (receipt?.phase === "applied") return { changed: false, target: receipt.target, data: { batch_id: input.batch_id, replay: true }, artifacts: [] };
    const batch = await loadBatch(root, input.batch_id, source, receipt !== undefined, now); const decisions = validateDecisions(batch, input);
    const cursors = await readState(root, "cursors"); const currentCursor = typeof cursors.value[source] === "string" ? cursors.value[source] : null;
    if (currentCursor !== batch.initial_cursor && currentCursor !== batch.next_cursor) throw new MindosError("mindos.state.conflict", "provider cursor changed after prepare");
    const seen = await readState(root, "seen"); const sourceSeen = typeof seen.value[source] === "object" && seen.value[source] !== null ? seen.value[source] as Record<string, string> : {};
    const date = receipt?.date ?? new Date(now).toISOString().slice(0, 10); const target = receipt?.target ?? `${batch.config.output}/${date}.md`;
    const daily = await readDaily(root, target); const rendered = renderDaily(batch, decisions, date, daily.content);
    const outputChanged = rendered !== daily.content; const unseen = batch.signals.filter((signal) => !(signal.id in sourceSeen));
    const cursorChanged = batch.next_cursor !== null && currentCursor !== batch.next_cursor;
    const data = { batch_id: batch.id, candidate_count: batch.signals.length, kept: [...decisions.values()].filter((item) => item.decision === "keep").length, discarded: [...decisions.values()].filter((item) => item.decision === "discard").length };
    const artifacts = [
      ...(outputChanged ? [{ kind: "daily_digest", path: target }] : []),
      ...(unseen.length > 0 ? [{ kind: "state", path: ".mindos/collect/seen.json" }] : []),
      ...(cursorChanged ? [{ kind: "state", path: ".mindos/collect/cursors.json" }] : []),
      { kind: "state", path: ".mindos/collect/receipts.json" },
    ];
    if (!options.apply) return { changed: outputChanged || unseen.length > 0 || cursorChanged, target, data, artifacts };
    if (!outputChanged && unseen.length === 0 && !cursorChanged && receipt === undefined) return { changed: false, target, data, artifacts: [] };
    const active = receipt ?? { source, decision_hash: decisionHash, date, target, phase: "reserved", reserved_at: now };
    if (receipt === undefined) await setReceipt(root, receipts, batch.id, active, "reserved", options.afterPhase);
    if (rendered !== daily.content) await atomicWrite(root, target, rendered, { expectedHash: daily.hash });
    active.output_hash = contentHash(Buffer.from(rendered, "utf8")); await setReceipt(root, receipts, batch.id, active, "output", options.afterPhase);
    for (const signal of batch.signals) sourceSeen[signal.id] ??= date;
    seen.value[source] = sourceSeen; await writeState(root, "seen", seen); await setReceipt(root, receipts, batch.id, active, "seen", options.afterPhase);
    if (batch.next_cursor !== null) { cursors.value[source] = batch.next_cursor; await writeState(root, "cursors", cursors); }
    await setReceipt(root, receipts, batch.id, active, "cursor", options.afterPhase);
    await setReceipt(root, receipts, batch.id, active, "applied", options.afterPhase);
    await unlink(await batchFile(root, batch.id)).catch(() => undefined);
    return { changed: outputChanged || unseen.length > 0 || cursorChanged, target, data, artifacts };
  } finally { await lock.release(); }
}

export async function collectionState(root: string, name: "seen" | "cursors"): Promise<Record<string, unknown>> {
  return (await readState(root, name)).value;
}
