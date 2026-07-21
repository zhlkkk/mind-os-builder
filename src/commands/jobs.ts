import type { Command } from "commander";
import { loadJob, loadJobs } from "../jobs/catalog.js";
import { blockedFromError, previewResult, type CliResult } from "../lib/result.js";

type Emit = (result: CliResult) => void;

async function list(): Promise<CliResult> {
  try {
    const jobs = (await loadJobs()).map(({ id, name, command, skill, effects, schedule }) => ({ id, name, entry: command === undefined ? { skill } : { command }, effects, ...(schedule === undefined ? {} : { schedule }) }));
    return previewResult({ count: jobs.length, jobs });
  } catch (error: unknown) { return blockedFromError(error); }
}

async function show(id: string): Promise<CliResult> {
  try { return previewResult({ job: await loadJob(id) }); } catch (error: unknown) { return blockedFromError(error, { id }); }
}

export function registerJobCommands(program: Command, emit: Emit): void {
  const jobs = program.command("jobs").description("只读展示声明式 Job");
  jobs.command("list").option("--json", "输出版本化 JSON").action(async () => emit(await list()));
  jobs.command("show <id>").option("--json", "输出版本化 JSON").action(async (id: string) => emit(await show(id)));
}
