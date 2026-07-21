#!/usr/bin/env node

import { Command } from "commander";

const program = new Command()
  .name("mindos")
  .description("Mind OS 的 TypeScript 命令行入口")
  .version("0.1.0");

program.showHelpAfterError();
program.parse();
