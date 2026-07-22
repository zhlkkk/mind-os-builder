import type { Command } from "commander";
import { loadJob, loadJobs } from "../jobs/catalog.js";
import { exportJob, type JobExportOptions } from "../jobs/export.js";
import { blockedFromError, previewResult, type CliResult } from "../lib/result.js";

type Emit = (result: CliResult) => void;
type JobExportCliOptions = Omit<JobExportOptions, "inputs"> & { input: string[] };

async function list(): Promise<CliResult> {
  try {
    const jobs = (await loadJobs()).map(({ id, name, command, skill, effects, schedule }) => ({ id, name, entry: command === undefined ? { skill } : { command }, effects, ...(schedule === undefined ? {} : { schedule }) }));
    return previewResult({ count: jobs.length, jobs });
  } catch (error: unknown) { return blockedFromError(error); }
}

async function show(id: string): Promise<CliResult> {
  try { return previewResult({ job: await loadJob(id) }); } catch (error: unknown) { return blockedFromError(error, { id }); }
}

async function exportDefinition(id: string, options: JobExportOptions): Promise<CliResult> {
  try { return previewResult({ export: exportJob(await loadJob(id), options) }); } catch (error: unknown) { return blockedFromError(error, { id, adapter: options.adapter }); }
}

const collectInput = (value: string, previous: string[]): string[] => [...previous, value];

export function registerJobCommands(program: Command, emit: Emit): void {
  const jobs = program.command("jobs").description("校验、展示和导出声明式 Job");
  jobs.command("list").option("--json", "输出版本化 JSON").action(async () => emit(await list()));
  jobs.command("show <id>").option("--json", "输出版本化 JSON").action(async (id: string) => emit(await show(id)));
  jobs.command("export <id>")
    .requiredOption("--adapter <adapter>", "agent、cron 或 launchd")
    .option("--input <key=value>", "显式绑定 Job 输入，可重复", collectInput, [])
    .option("--executable <path>", "mindos 可执行文件路径；系统调度器要求绝对路径")
    .option("--schedule <schedule>", "覆盖 Job 的调度提示")
    .option("--json", "输出版本化 JSON")
    .action(async (id: string, { input, ...options }: JobExportCliOptions) => emit(await exportDefinition(id, { ...options, inputs: input })));
}
