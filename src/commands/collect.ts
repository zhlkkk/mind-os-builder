import { randomUUID } from "node:crypto";
import type { Command } from "commander";
import { readJsonInput } from "../lib/input.js";
import { MindosError } from "../lib/paths.js";
import { appliedResult, blockedFromError, failedResult, needsAgentResult, noopResult, previewResult, type CliResult } from "../lib/result.js";
import { batchHash, filterSignals, loadCollectConfig, type Batch, type Source } from "../collect/model.js";
import { saveBatch, vaultKey } from "../collect/batch.js";
import { collectionState, commitCollection, parseCollectionDecisions } from "../collect/commit.js";
import { fetchRss, markRssRead } from "../collect/providers/folo.js";
import { fetchTwitter } from "../collect/providers/opencli.js";

type Emit = (result: CliResult) => void;

async function prepare(root: string, source: Source): Promise<CliResult> {
  try {
    const config = await loadCollectConfig(root, source); const cursors = await collectionState(root, "cursors");
    const cursor = typeof cursors[source] === "string" ? cursors[source] : null;
    const provider = source === "twitter" ? await fetchTwitter(cursor) : await fetchRss(cursor);
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
    return error instanceof MindosError && (error.code.startsWith("mindos.provider.") || error.code.startsWith("mindos.dependency."))
      ? failedResult(error) : blockedFromError(error);
  }
}

export function registerCollectCommands(program: Command, emit: Emit): void {
  const collect = program.command("collect").description("OpenCLI/Folo 两阶段采集");
  for (const source of ["twitter", "rss"] as const) {
    const group = collect.command(source);
    group.command("prepare <vault>").option("--json", "输出版本化 JSON").action(async (vault: string) => emit(await prepare(vault, source)));
    group.command("commit <vault> <decisions>").option("--apply", "提交每日简报与状态")
      .option("--revert", "按原决策文件撤回已提交的 Twitter 托管批次").option("--json", "输出版本化 JSON")
      .action(async (vault: string, decisions: string, options: { apply?: boolean; revert?: boolean }) =>
        emit(await commit(vault, source, decisions, options.apply === true, options.revert === true)));
  }
}
