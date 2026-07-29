#!/usr/bin/env node

import { Command, CommanderError } from "commander";
import { registerBooksCommands } from "./commands/books.js";
import { registerCollectCommands } from "./commands/collect.js";
import { doctor } from "./commands/doctor.js";
import { registerDistillCommands } from "./commands/distill.js";
import { registerJobCommands } from "./commands/jobs.js";
import { registerMcpCommands } from "./commands/mcp.js";
import { registerResearchCommands } from "./commands/research.js";
import { installSkills } from "./commands/skills-install.js";
import { registerRadarCommands } from "./commands/radar.js";
import { registerWikiCommands } from "./commands/wiki.js";
import { MindosError } from "./lib/paths.js";
import { blockedFromError, failedResult, type CliResult } from "./lib/result.js";

function emit(result: CliResult): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

const program = new Command()
  .name("mindos")
  .description("Mind OS 的 TypeScript 命令行入口")
  .version("0.1.1");

program.exitOverride();
program.configureOutput({ writeErr: () => undefined });
program.showHelpAfterError();
program
  .command("doctor")
  .option("--json", "输出版本化 JSON")
  .action(async () => {
    emit(await doctor());
  });

registerWikiCommands(program, emit);
registerBooksCommands(program, emit);
registerCollectCommands(program, emit);
registerDistillCommands(program, emit);
registerJobCommands(program, emit);
registerMcpCommands(program);
registerRadarCommands(program, emit);
registerResearchCommands(program, emit);

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
  if (error instanceof CommanderError) {
    if (error.code !== "commander.helpDisplayed" && error.code !== "commander.version") {
      emit(blockedFromError(new MindosError("mindos.input.invalid", "invalid command arguments")));
    }
  } else {
    emit(failedResult(error));
  }
}
