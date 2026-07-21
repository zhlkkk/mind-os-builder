#!/usr/bin/env node

import { Command } from "commander";
import { doctor } from "./commands/doctor.js";
import { failedResult, type CliResult } from "./lib/result.js";

function emit(result: CliResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

const program = new Command()
  .name("mindos")
  .description("Mind OS 的 TypeScript 命令行入口")
  .version("0.1.0");

program.showHelpAfterError();
program
  .command("doctor")
  .option("--json", "输出版本化 JSON")
  .action(async () => {
    emit(await doctor());
  });

try {
  await program.parseAsync();
} catch (error: unknown) {
  emit(failedResult(error));
}
