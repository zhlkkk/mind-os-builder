import type { Command } from "commander";
import { commitResearch } from "../research/commit.js";
import type { CliResult } from "../lib/result.js";

type Emit = (result: CliResult) => void;

export function registerResearchCommands(program: Command, emit: Emit): void {
  program.command("research").description("校验并提交外层 Agent 生成的技术调研候选")
    .command("commit <vault> <candidate>")
    .requiredOption("--target <path>", "raw/research 下的新报告路径")
    .option("--apply", "提交候选报告")
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string, candidate: string, options: { target: string; apply?: boolean }) => emit(await commitResearch(vault, candidate, options.target, options.apply === true)));
}
