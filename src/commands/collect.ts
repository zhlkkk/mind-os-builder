import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import type { Command } from "commander";
import { readJsonInput } from "../lib/input.js";
import { acquireVaultLock } from "../lib/lock.js";
import { MindosError } from "../lib/paths.js";
import { appliedResult, blockedFromError, blockedResult, failedResult, needsAgentResult, noopResult, previewResult, type CliResult } from "../lib/result.js";
import { batchHash, filterSignals, loadCollectConfig, normalizeProvider, type Batch, type Source } from "../collect/model.js";
import { batchFile, loadBatch, saveBatch, vaultKey } from "../collect/batch.js";
import { collectionState, commitCollection, parseCollectionDecisions, readState, setReceipt, type Receipt } from "../collect/commit.js";
import { auditTwitterTarget, TwitterQualityError } from "../collect/audit.js";
import { fetchRss, markRssRead } from "../collect/providers/folo.js";
import { fetchTwitter } from "../collect/providers/opencli.js";

type Emit = (result: CliResult) => void;
type PrepareOptions = { provider?: string; input?: string };

async function prepare(root: string, source: Source, options: PrepareOptions = {}): Promise<CliResult> {
  try {
    const config = await loadCollectConfig(root, source); const cursors = await collectionState(root, "cursors");
    const cursor = typeof cursors[source] === "string" ? cursors[source] : null;
    let provider: Awaited<ReturnType<typeof fetchTwitter>>;
    if (source === "rss") {
      provider = await fetchRss(cursor);
    } else if ((options.provider ?? "opencli") === "opencli") {
      if (options.input !== undefined) throw new MindosError("mindos.input.invalid", "OpenCLI provider does not accept an input file");
      provider = await fetchTwitter(cursor);
    } else if (options.provider === "ego-browser") {
      if (options.input === undefined) throw new MindosError("mindos.input.invalid", "ego-browser provider requires an input file");
      provider = normalizeProvider("twitter", await readJsonInput(options.input, { maxBytes: 1024 * 1024, maxDepth: 12 }));
    } else {
      throw new MindosError("mindos.input.invalid", "unknown Twitter provider");
    }
    const seen = await collectionState(root, "seen"); const sourceSeen = typeof seen[source] === "object" && seen[source] !== null ? seen[source] as Record<string, unknown> : {};
    const unseen = provider.signals.filter((signal) => !(signal.id in sourceSeen)); const filtered = filterSignals(unseen, config.filters);
    const id = randomUUID().replaceAll("-", "");
    const payload: Omit<Batch, "baseline_hash"> = { version: "v1", id, vault: await vaultKey(root), source, created_at: Date.now(), initial_cursor: cursor, next_cursor: provider.cursor, signals: filtered.signals, config };
    const batch: Batch = { ...payload, baseline_hash: batchHash(payload) }; await saveBatch(root, batch);
    return needsAgentResult({ batch_id: id, baseline_hash: batch.baseline_hash, candidate_count: batch.signals.length, candidates: batch.signals, categories: batch.config.categories, filter_reasons: filtered.rejected });
  } catch (error: unknown) {
    return error instanceof MindosError && (error.code.startsWith("mindos.provider.") || error.code.startsWith("mindos.dependency."))
      ? failedResult(error) : blockedFromError(error);
  }
}

async function commit(root: string, source: Source, path: string, apply: boolean, revert: boolean): Promise<CliResult> {
  try {
    const input = parseCollectionDecisions(await readJsonInput(path, { maxBytes: 1024 * 1024, maxDepth: 12 }));
    const outcome = await commitCollection(root, source, input, {
      apply,
      revert,
      ...(source === "rss" ? { afterCommit: async (batch: Batch) => {
        if (batch.config.markReadAfterCommit === true) await markRssRead(batch.signals.map((signal) => signal.id));
      } } : {}),
    });
    if (!apply) return outcome.changed ? previewResult(outcome.data, outcome.artifacts) : noopResult(outcome.data);
    return outcome.changed ? appliedResult(outcome.data, outcome.artifacts) : noopResult(outcome.data);
  } catch (error: unknown) {
    if (error instanceof TwitterQualityError) return blockedFromError(error, { quality: error.report });
    return error instanceof MindosError && (error.code.startsWith("mindos.provider.") || error.code.startsWith("mindos.dependency."))
      ? failedResult(error) : blockedFromError(error);
  }
}

async function auditTwitter(root: string, date: string | undefined): Promise<CliResult> {
  try {
    if (date === undefined || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new MindosError("mindos.input.invalid", "audit date must use YYYY-MM-DD");
    const config = await loadCollectConfig(root, "twitter"); const target = `${config.output}/${config.filename.replace("{date}", date)}`;
    const quality = await auditTwitterTarget(root, target);
    return quality.valid ? noopResult({ target, quality }) : blockedResult("mindos.state.conflict", "Twitter daily digest failed quality audit", { target, quality });
  } catch (error: unknown) { return blockedFromError(error); }
}

async function recoverRss(root: string, apply: boolean): Promise<CliResult> {
  const lock = await acquireVaultLock(root, ".mindos/locks/collect-rss.lock");
  try {
    const receipts = await readState(root, "receipts");
    const pending = Object.entries(receipts.value).filter(([, value]) => typeof value === "object" && value !== null
      && (value as Partial<Receipt>).source === "rss" && (value as Partial<Receipt>).phase === "cursor");
    const batches = await Promise.all(pending.map(([id]) => loadBatch(root, id, "rss", true)));
    if (batches.some((batch) => batch.config.markReadAfterCommit !== true)) throw new MindosError("mindos.state.conflict", "RSS recovery batch does not require read sync");
    const data = { pending_count: batches.length, batch_ids: batches.map((batch) => batch.id), mark_read_count: batches.reduce((sum, batch) => sum + batch.signals.length, 0) };
    const artifacts = batches.length > 0 ? [{ kind: "state", path: ".mindos/collect/receipts.json" }] : [];
    if (!apply) return batches.length > 0 ? previewResult(data, artifacts) : noopResult(data);
    for (const [index, batch] of batches.entries()) {
      await markRssRead(batch.signals.map((signal) => signal.id));
      await setReceipt(root, receipts, batch.id, pending[index]![1] as Receipt, "applied");
      await unlink(await batchFile(root, batch.id)).catch(() => undefined);
    }
    return batches.length > 0 ? appliedResult(data, artifacts) : noopResult(data);
  } catch (error: unknown) {
    return error instanceof MindosError && (error.code.startsWith("mindos.provider.") || error.code.startsWith("mindos.dependency."))
      ? failedResult(error) : blockedFromError(error);
  } finally { await lock.release(); }
}

export function registerCollectCommands(program: Command, emit: Emit): void {
  const collect = program.command("collect").description("Twitter/RSS 两阶段采集");
  for (const source of ["twitter", "rss"] as const) {
    const group = collect.command(source);
    const prepareCommand = group.command("prepare <vault>").option("--json", "输出版本化 JSON");
    if (source === "twitter") prepareCommand.option("--provider <provider>", "Twitter Provider", "opencli").option("--input <path>", "ego-browser 采集 JSON 文件");
    prepareCommand.action(async (vault: string, options: PrepareOptions) => emit(await prepare(vault, source, options)));
    if (source === "rss") group.command("recover <vault>").option("--apply", "重试未完成的 Folo 已读同步")
      .option("--json", "输出版本化 JSON").action(async (vault: string, options: { apply?: boolean }) => emit(await recoverRss(vault, options.apply === true)));
    if (source === "twitter") group.command("audit <vault>").option("--date <date>", "要审计的本地日期 YYYY-MM-DD")
      .option("--json", "输出版本化 JSON").action(async (vault: string, options: { date?: string }) => emit(await auditTwitter(vault, options.date)));
    group.command("commit <vault> <decisions>").option("--apply", "提交每日简报与状态")
      .option("--revert", "按原决策文件撤回已提交的 Twitter 托管批次").option("--json", "输出版本化 JSON")
      .action(async (vault: string, decisions: string, options: { apply?: boolean; revert?: boolean }) =>
        emit(await commit(vault, source, decisions, options.apply === true, options.revert === true)));
  }
}
