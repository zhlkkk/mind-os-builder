#!/usr/bin/env node

import { Command } from "commander";
import { registerBooksCommands } from "./commands/books.js";
import { doctor } from "./commands/doctor.js";
import { installSkills } from "./commands/skills-install.js";
import { registerWikiCommands } from "./commands/wiki.js";
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

registerWikiCommands(program, emit);
registerBooksCommands(program, emit);

program
  .command("skills")
  .command("install <host>")
  .requiredOption("--scope <scope>", "project 或 user", "project")
  .option("--project <path>", "项目根目录", process.cwd())
  .option("--home <path>", "用户根目录")
  .option("--apply", "执行复制")
  .option("--json", "输出版本化 JSON")
  .action(async (host: string, options: { scope: "project" | "user"; project: string; home?: string; apply?: boolean }) => {
    emit(await installSkills({
      host,
      scope: options.scope,
      project: options.project,
      ...(options.home === undefined ? {} : { home: options.home }),
      ...(options.apply === undefined ? {} : { apply: options.apply }),
    }));
  });

try {
  await program.parseAsync();
} catch (error: unknown) {
  emit(failedResult(error));
}
