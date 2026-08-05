import { readFile, stat, unlink } from "node:fs/promises";
import { parseContract } from "../lib/contracts.js";
import { acquireVaultLock } from "../lib/lock.js";
import { MindosError, resolveReadPath, resolveWritePath } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { batchFile, loadBatch } from "./batch.js";
import type { Batch, Decision, Source } from "./model.js";

export type Phase = "reserved" | "output" | "seen" | "cursor" | "applied" | "reverted";
export type Receipt = { source: Source; decision_hash: string; date: string; target: string; phase: Phase; reserved_at: number; output_hash?: string };
export type JsonState = { value: Record<string, unknown>; hash: string | null };
export type DecisionInput = { version: "v1"; batch_id: string; baseline_hash: string; decisions: Decision[] };
export type CommitOptions = { apply: boolean; revert?: boolean; now?: number; afterPhase?: (phase: Phase) => void | Promise<void>; afterCommit?: (batch: Batch) => void | Promise<void> };
export type CommitOutcome = { changed: boolean; target?: string; data: Record<string, unknown>; artifacts: Array<{ kind: string; path: string }> };

async function boundedRead(path: string, maxBytes: number): Promise<string> {
  if ((await stat(path)).size > maxBytes) throw new MindosError("mindos.state.conflict", "collection file is too large");
  return readFile(path, "utf8");
}

export async function readState(root: string, name: string): Promise<JsonState> {
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

const inline = (value: string, limit = 32_000): string => value.slice(0, limit).replace(/[\r\n]+/gu, " ").replace(/([\\`*_[\]<>])/gu, "\\$1");
const markdownDestination = (value: string): string => `<${value.replace(/[()[\]<>\\\s]/gu, (character) =>
  [...Buffer.from(character, "utf8")].map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, "0")}`).join(""))}>`;
const marker = (source: Source, id: string): string => `<!-- mindos:collect:${source}:${id} -->`;

function twitterAuthor(url: string, fallback = "source"): string {
  try {
    const parsed = new URL(url); const handle = parsed.hostname === "x.com" ? parsed.pathname.split("/")[1] : undefined;
    if (handle !== undefined && /^[A-Za-z0-9_]{1,50}$/u.test(handle)) return handle;
  } catch { /* URL 已在 Provider 规范化时校验；这里只使用安全回退。 */ }
  const author = fallback.trim().replace(/^@/u, "");
  return /^[A-Za-z0-9_]{1,50}$/u.test(author) ? author : "source";
}

function rssSource(url: string, fallback = ""): string {
  if (fallback.trim().length > 0) return fallback.trim();
  try { return new URL(url).hostname.replace(/^www\./u, "") || "来源"; } catch { return "来源"; }
}

function normalizeTwitterSection(section: string): string {
  let number = Math.max(0, ...[...section.matchAll(/^(\d+)\.\s/gmu)].map((match) => Number(match[1])));
  const detailed = /<!-- mindos:collect:twitter:([\w.:-]+) -->\n### ([^\n]+)\n\n([^\n]+)\n\n- 来源：\[[^\n]*\]\(<(https?:\/\/[^>\n]+)>\)(?:\n- 原文：[^\n]*)?(?:\n- 标签：[^\n]*)?/gu;
  return section.replace(detailed, (_match, id: string, title: string, summary: string, url: string) => {
    number += 1;
    return `${marker("twitter", id)}\n${number}. **${title}**：${summary}\n   — [@${twitterAuthor(url)}](${markdownDestination(url)})`;
  });
}

function normalizeTwitterManaged(content: string): string {
  return content.split(/(?=^## )/mu).map((part) => part.startsWith("## ") ? normalizeTwitterSection(part) : part).join("");
}

function normalizeRssSection(section: string, sources: Map<string, string>): string {
  let number = Math.max(0, ...[...section.matchAll(/^(\d+)\.\s/gmu)].map((match) => Number(match[1])));
  const detailed = /<!-- mindos:collect:rss:([\w.:-]+) -->\n### ([^\n]+)\n\n([^\n]+)\n\n- 来源：\[[^\n]*\]\(<(https?:\/\/[^>\n]+)>\)(?:\n- 原文：[^\n]*)?(?:\n- 标签：[^\n]*)?/gu;
  return section.replace(detailed, (_match, id: string, title: string, summary: string, url: string) => {
    number += 1;
    return `${marker("rss", id)}\n${number}. **${title}**：${summary}\n   — [${inline(rssSource(url, sources.get(id)), 200)}](${markdownDestination(url)}) · Folo entry \`${id}\``;
  });
}

function normalizeRssManaged(content: string, batch: Batch): string {
  const sources = new Map(batch.signals.map((signal) => [signal.id, signal.author]));
  return content.split(/(?=^## )/mu).map((part) => part.startsWith("## ") ? normalizeRssSection(part, sources) : part).join("");
}

function nextNumber(content: string, headingIndex: number, headingLength: number): number {
  const nextHeading = content.indexOf("\n## ", headingIndex + headingLength);
  const section = content.slice(headingIndex, nextHeading < 0 ? content.length : nextHeading);
  return Math.max(0, ...[...section.matchAll(/^(\d+)\.\s/gmu)].map((match) => Number(match[1]))) + 1;
}

function initialDaily(source: Source, date: string, now: number): string {
  const count = source === "twitter" ? "tweet_count" : "entry_count";
  const title = source === "twitter" ? `X/Twitter 每日信息简报 — ${date}` : `${date} - Folo精选信息简报`;
  const origin = source === "twitter" ? "x.com/home" : "folo";
  const time = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `---\ndate: ${date}\nsource: ${origin}\n${count}: 0\nlast_updated: "${time}"\n---\n\n# ${title}\n`;
}

function updateDailyMetadata(source: Source, content: string, now: number): string {
  if (!content.startsWith("---\n")) return content;
  const ids = new Set<string>();
  const markerPattern = new RegExp(`mindos:collect:${source}:([\\w.:-]+)`, "gu");
  for (const match of content.matchAll(markerPattern)) ids.add(match[1] ?? "");
  const legacyPattern = source === "twitter" ? /x\.com\/[^/\s)]+\/status\/(\d+)/gu : /Folo entry `([\w.:-]+)`/gu;
  for (const match of content.matchAll(legacyPattern)) ids.add(match[1] ?? "");
  ids.delete("");
  const count = source === "twitter" ? "tweet_count" : "entry_count";
  const time = new Date(now).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return content.replace(new RegExp(`^${count}: \\d+$`, "mu"), `${count}: ${ids.size}`)
    .replace(/^last_updated: .*$/mu, `last_updated: "${time}"`);
}

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
      || decision.display_summary?.trim() === "" || (decision.display_summary?.length ?? 0) > 32_000
      || decision.category === undefined || !(decision.category in batch.config.categories)
      || decision.tags?.some((tag) => tag.trim() === "" || tag.length > 80))) {
      throw new MindosError("mindos.input.invalid", "collection decision display fields are invalid");
    }
    decisions.set(decision.id, decision);
  }
  const kept = [...decisions.values()].filter((decision) => decision.decision === "keep");
  const bareShortlink = /^(?:[\s\p{Extended_Pictographic}\uFE0F]*)https:\/\/t\.co\/[A-Za-z0-9]+$/u;
  for (const decision of kept) {
    const title = decision.display_title?.trim() ?? ""; const summary = decision.display_summary?.trim() ?? "";
    if (bareShortlink.test(title) || bareShortlink.test(summary) || (title === summary && title.length <= 40)) {
      throw new MindosError("mindos.input.invalid", "collection decisions failed semantic quality checks");
    }
  }
  const reasons = new Set(input.decisions.map((decision) => decision.reason.trim()));
  if (batch.signals.length >= 10 && kept.length === batch.signals.length && reasons.size === 1) throw new MindosError("mindos.input.invalid", "collection decisions look mechanically generated");
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

function renderDaily(batch: Batch, decisions: Map<string, Decision>, date: string, existing: string, now: number): string {
  let output = existing || initialDaily(batch.source, date, now);
  if (batch.source === "twitter") output = normalizeTwitterManaged(output);
  else output = normalizeRssManaged(output, batch);
  const additions = batch.signals.filter((signal) => decisions.get(signal.id)?.decision === "keep"
    && !output.includes(marker(batch.source, signal.id)) && !output.includes(signal.url));
  if (additions.length === 0) return output === existing ? existing : updateDailyMetadata(batch.source, output, now);
  const categories = Object.entries(batch.config.categories);
  for (const [categoryIndex, [category, label]] of categories.entries()) {
    const grouped = additions.filter((signal) => decisions.get(signal.id)?.category === category);
    if (grouped.length === 0) continue;
    const heading = `## ${inline(label, 200)}`; let headingIndex = output.indexOf(`${heading}\n`);
    if (headingIndex < 0) {
      const laterHeading = categories.slice(categoryIndex + 1).map(([, later]) => output.indexOf(`## ${inline(later, 200)}\n`)).find((index) => index >= 0);
      if (laterHeading === undefined) output = `${output.trimEnd()}\n\n${heading}\n`;
      else output = `${output.slice(0, laterHeading).trimEnd()}\n\n${heading}\n\n${output.slice(laterHeading)}`;
      headingIndex = output.indexOf(`${heading}\n`);
    }
    let block = "";
    let number = nextNumber(output, headingIndex, heading.length);
    for (const signal of grouped) {
      const decision = decisions.get(signal.id) as Decision;
      if (batch.source === "twitter") {
        block += `\n${marker(batch.source, signal.id)}\n${number}. **${inline(decision.display_title ?? signal.title, 500)}**：${inline(decision.display_summary ?? "")}\n   — [@${inline(twitterAuthor(signal.url, signal.author), 80)}](${markdownDestination(signal.url)})`;
      } else {
        block += `\n${marker(batch.source, signal.id)}\n${number}. **${inline(decision.display_title ?? signal.title, 500)}**：${inline(decision.display_summary ?? "")}\n   — [${inline(rssSource(signal.url, signal.author), 200)}](${markdownDestination(signal.url)}) · Folo entry \`${signal.id}\``;
      }
      number += 1;
      block += "\n";
    }
    const nextHeading = output.indexOf("\n## ", headingIndex + heading.length);
    const insertion = nextHeading < 0 ? output.length : nextHeading;
    output = `${output.slice(0, insertion).trimEnd()}\n${block}${output.slice(insertion)}`;
  }
  return updateDailyMetadata(batch.source, output, now);
}

function removeTwitterManagedEntries(content: string, ids: Set<string>, now: number): string {
  const lines = content.split("\n"); const kept: string[] = [];
  for (let index = 0; index < lines.length;) {
    const match = lines[index]?.match(/^<!-- mindos:collect:twitter:([\w.:-]+) -->$/u);
    if (match?.[1] !== undefined && ids.has(match[1]) && /^\d+\. /u.test(lines[index + 1] ?? "") && /^ {3}— /u.test(lines[index + 2] ?? "")) {
      index += lines[index + 3] === "" ? 4 : 3; continue;
    }
    kept.push(lines[index] ?? ""); index += 1;
  }
  let number = 0; const renumbered = kept.map((line) => {
    if (line.startsWith("## ")) number = 0;
    return /^\d+\. /u.test(line) ? line.replace(/^\d+\./u, `${String(number += 1)}.`) : line;
  }).join("\n");
  return updateDailyMetadata("twitter", renumbered, now);
}

export async function setReceipt(root: string, state: JsonState, id: string, receipt: Receipt, phase: Phase, hook?: CommitOptions["afterPhase"]): Promise<void> {
  receipt.phase = phase; state.value[id] = receipt; await writeState(root, "receipts", state); await hook?.(phase);
}

export function parseCollectionDecisions(value: unknown): DecisionInput {
  return parseContract("collectionDecisions", value, "collection decisions are invalid");
}

export async function commitCollection(root: string, source: Source, input: DecisionInput, options: CommitOptions): Promise<CommitOutcome> {
  const now = options.now ?? Date.now(); const decisionHash = contentHash(Buffer.from(JSON.stringify(input), "utf8"));
  const lock = await acquireVaultLock(root, `.mindos/locks/collect-${source}.lock`);
  try {
    const receipts = await readState(root, "receipts"); const rawReceipt = receipts.value[input.batch_id];
    const receipt = typeof rawReceipt === "object" && rawReceipt !== null ? rawReceipt as Receipt : undefined;
    if (receipt !== undefined && (receipt.source !== source || receipt.decision_hash !== decisionHash || now - receipt.reserved_at > 30 * 86_400_000)) {
      throw new MindosError("mindos.state.conflict", "collection receipt does not match this commit");
    }
    if (options.revert === true) {
      if (source !== "twitter") throw new MindosError("mindos.input.invalid", "only Twitter collection batches can be reverted");
      if (receipt === undefined) throw new MindosError("mindos.state.conflict", "collection receipt is required to revert a batch");
      if (receipt.phase === "reverted") return { changed: false, target: receipt.target, data: { batch_id: input.batch_id, replay: true }, artifacts: [] };
      if (receipt.phase !== "applied") throw new MindosError("mindos.state.conflict", "only an applied collection batch can be reverted");
      const daily = await readDaily(root, receipt.target); const ids = new Set(input.decisions.map((decision) => decision.id));
      const rendered = removeTwitterManagedEntries(daily.content, ids, now); const outputChanged = rendered !== daily.content;
      const seen = await readState(root, "seen"); const sourceSeen = typeof seen.value.twitter === "object" && seen.value.twitter !== null ? seen.value.twitter as Record<string, string> : {};
      const removedSeen = [...ids].filter((id) => id in sourceSeen);
      const data = { batch_id: input.batch_id, candidate_count: ids.size, reverted_entries: ids.size };
      const artifacts = [...(outputChanged ? [{ kind: "daily_digest", path: receipt.target }] : []),
        ...(removedSeen.length > 0 ? [{ kind: "state", path: ".mindos/collect/seen.json" }] : []),
        { kind: "state", path: ".mindos/collect/receipts.json" }];
      if (!options.apply) return { changed: outputChanged || removedSeen.length > 0, target: receipt.target, data, artifacts };
      if (outputChanged) await atomicWrite(root, receipt.target, rendered, { expectedHash: daily.hash });
      for (const id of removedSeen) delete sourceSeen[id];
      if (removedSeen.length > 0) { seen.value.twitter = sourceSeen; await writeState(root, "seen", seen); }
      receipt.output_hash = contentHash(Buffer.from(rendered, "utf8")); await setReceipt(root, receipts, input.batch_id, receipt, "reverted", options.afterPhase);
      return { changed: outputChanged || removedSeen.length > 0, target: receipt.target, data, artifacts };
    }
    if (receipt?.phase === "applied") return { changed: false, target: receipt.target, data: { batch_id: input.batch_id, replay: true }, artifacts: [] };
    const batch = await loadBatch(root, input.batch_id, source, receipt !== undefined, now); const decisions = validateDecisions(batch, input);
    const cursors = await readState(root, "cursors"); const currentCursor = typeof cursors.value[source] === "string" ? cursors.value[source] : null;
    if (currentCursor !== batch.initial_cursor && currentCursor !== batch.next_cursor) throw new MindosError("mindos.state.conflict", "provider cursor changed after prepare");
    const seen = await readState(root, "seen"); const sourceSeen = typeof seen.value[source] === "object" && seen.value[source] !== null ? seen.value[source] as Record<string, string> : {};
    const localNow = new Date(now); const date = receipt?.date ?? `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, "0")}-${String(localNow.getDate()).padStart(2, "0")}`;
    const target = receipt?.target ?? `${batch.config.output}/${batch.config.filename.replace("{date}", date)}`;
    const daily = await readDaily(root, target); const rendered = renderDaily(batch, decisions, date, daily.content, now);
    const outputChanged = rendered !== daily.content; const unseen = batch.signals.filter((signal) => !(signal.id in sourceSeen));
    const cursorChanged = batch.next_cursor !== null && currentCursor !== batch.next_cursor;
    const markReadChanged = source === "rss" && batch.config.markReadAfterCommit === true && batch.signals.length > 0;
    const data = {
      batch_id: batch.id,
      candidate_count: batch.signals.length,
      kept: [...decisions.values()].filter((item) => item.decision === "keep").length,
      discarded: [...decisions.values()].filter((item) => item.decision === "discard").length,
      ...(source === "rss" ? { mark_read_count: batch.config.markReadAfterCommit === true ? batch.signals.length : 0 } : {}),
    };
    const artifacts = [
      ...(outputChanged ? [{ kind: "daily_digest", path: target }] : []),
      ...(unseen.length > 0 ? [{ kind: "state", path: ".mindos/collect/seen.json" }] : []),
      ...(cursorChanged ? [{ kind: "state", path: ".mindos/collect/cursors.json" }] : []),
      { kind: "state", path: ".mindos/collect/receipts.json" },
    ];
    if (!options.apply) return { changed: outputChanged || unseen.length > 0 || cursorChanged || markReadChanged, target, data, artifacts };
    if (!outputChanged && unseen.length === 0 && !cursorChanged && receipt === undefined) return { changed: false, target, data, artifacts: [] };
    const active = receipt ?? { source, decision_hash: decisionHash, date, target, phase: "reserved", reserved_at: now };
    if (receipt === undefined) await setReceipt(root, receipts, batch.id, active, "reserved", options.afterPhase);
    if (rendered !== daily.content) await atomicWrite(root, target, rendered, { expectedHash: daily.hash });
    active.output_hash = contentHash(Buffer.from(rendered, "utf8")); await setReceipt(root, receipts, batch.id, active, "output", options.afterPhase);
    for (const signal of batch.signals) sourceSeen[signal.id] ??= date;
    seen.value[source] = sourceSeen; await writeState(root, "seen", seen); await setReceipt(root, receipts, batch.id, active, "seen", options.afterPhase);
    if (batch.next_cursor !== null) { cursors.value[source] = batch.next_cursor; await writeState(root, "cursors", cursors); }
    await setReceipt(root, receipts, batch.id, active, "cursor", options.afterPhase);
    await options.afterCommit?.(batch);
    await setReceipt(root, receipts, batch.id, active, "applied", options.afterPhase);
    await unlink(await batchFile(root, batch.id)).catch(() => undefined);
    return { changed: outputChanged || unseen.length > 0 || cursorChanged || markReadChanged, target, data, artifacts };
  } finally { await lock.release(); }
}

export async function collectionState(root: string, name: "seen" | "cursors"): Promise<Record<string, unknown>> {
  return (await readState(root, name)).value;
}
