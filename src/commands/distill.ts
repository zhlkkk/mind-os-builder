import type { Command } from "commander";
import { commitDistill } from "../distill/commit.js";
import { parseDistillResponses } from "../distill/responses.js";
import { scanJournal } from "../distill/scan.js";
import { readJsonInput } from "../lib/input.js";
import { appliedResult, blockedFromError, needsAgentResult, noopResult, previewResult, type CliResult } from "../lib/result.js";

type Emit = (result: CliResult) => void;

async function scan(root: string, source: string): Promise<CliResult> {
  try {
    const plan = await scanJournal(root, source);
    const data = {
      source_path: plan.source_path,
      baseline_hash: plan.baseline_hash,
      trigger_count: plan.triggers.length,
      triggers: plan.triggers,
      parallel: new Set(plan.triggers.map((item) => item.concurrency_key)).size > 1,
    };
    return plan.triggers.length === 0 ? noopResult(data) : needsAgentResult(data);
  } catch (error: unknown) {
    return blockedFromError(error);
  }
}

async function commit(root: string, source: string, responses: string, apply: boolean): Promise<CliResult> {
  try {
    const input = parseDistillResponses(await readJsonInput(responses, { maxBytes: 1024 * 1024, maxDepth: 12 }));
    const outcome = await commitDistill(root, source, input, apply);
    if (!apply) return outcome.changed ? previewResult(outcome.data, outcome.artifacts) : noopResult(outcome.data);
    return outcome.changed ? appliedResult(outcome.data, outcome.artifacts) : noopResult(outcome.data);
  } catch (error: unknown) {
    return blockedFromError(error);
  }
}

export function registerDistillCommands(program: Command, emit: Emit): void {
  const group = program.command("distill").description("扫描日记并校验提交角色回复");
  group.command("scan <vault> <source>").option("--json", "输出版本化 JSON")
    .action(async (vault: string, source: string) => emit(await scan(vault, source)));
  group.command("commit <vault> <source> <responses>").option("--apply", "提交角色回复").option("--json", "输出版本化 JSON")
    .action(async (vault: string, source: string, responses: string, options: { apply?: boolean }) => emit(await commit(vault, source, responses, options.apply === true)));
}
