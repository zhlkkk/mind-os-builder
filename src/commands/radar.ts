import type { Command } from "commander";
import { commitRadar } from "../radar/commit.js";
import { parseRadarDecisions } from "../radar/decisions.js";
import { prepareRadar } from "../radar/prepare.js";
import { readJsonInput } from "../lib/input.js";
import { appliedResult, blockedFromError, needsAgentResult, noopResult, previewResult, type CliResult } from "../lib/result.js";

type Emit = (result: CliResult) => void;
const collectPage = (value: string, previous: string[]): string[] => [...previous, value];

async function prepare(root: string, pages: readonly string[], hub: string | undefined, today: string): Promise<CliResult> {
  try {
    const outcome = await prepareRadar(root, pages, hub, today);
    const data = {
      batch_id: outcome.batch.id, baseline_hash: outcome.batch.baseline_hash,
      suggestion_count: outcome.batch.suggestions.length, suggestions: outcome.batch.suggestions, diagnostics: outcome.diagnostics,
    };
    return outcome.batch.suggestions.length === 0 ? noopResult(data) : needsAgentResult(data);
  } catch (error: unknown) { return blockedFromError(error); }
}

async function commit(root: string, decisions: string, apply: boolean): Promise<CliResult> {
  try {
    const input = parseRadarDecisions(await readJsonInput(decisions, { maxBytes: 1024 * 1024, maxDepth: 12 }));
    const outcome = await commitRadar(root, input, apply);
    if (!apply) return outcome.changed ? previewResult(outcome.data, outcome.artifacts) : noopResult(outcome.data);
    return outcome.changed ? appliedResult(outcome.data, outcome.artifacts) : noopResult(outcome.data);
  } catch (error: unknown) { return blockedFromError(error); }
}

export function registerRadarCommands(program: Command, emit: Emit): void {
  const group = program.command("radar").description("准备技术雷达建议并提交人工决定");
  group.command("prepare <vault>")
    .option("--page <page>", "Radar 页面，可重复", collectPage, [])
    .option("--hub <hub>", "包含 Radar 页面链接的索引")
    .option("--today <date>", "复查日期", new Date().toISOString().slice(0, 10))
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string, options: { page: string[]; hub?: string; today: string }) => emit(await prepare(vault, options.page, options.hub, options.today)));
  group.command("commit <vault> <decisions>").option("--apply", "提交批准的建议标记").option("--json", "输出版本化 JSON")
    .action(async (vault: string, decisions: string, options: { apply?: boolean }) => emit(await commit(vault, decisions, options.apply === true)));
}
