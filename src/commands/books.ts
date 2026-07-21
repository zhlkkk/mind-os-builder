import type { Command } from "commander";
import { initializeBooks } from "../books/init.js";
import { validateBooks } from "../books/validate.js";
import type { CliResult } from "../lib/result.js";

type Emit = (result: CliResult) => void;

export function registerBooksCommands(program: Command, emit: Emit): void {
  const books = program.command("books").description("Book Base 的确定性操作");
  books.command("init <vault>")
    .option("--apply", "写入 vault")
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string, options: { apply?: boolean }) => {
      emit(await initializeBooks(vault, options.apply === true));
    });
  books.command("validate <vault>")
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string) => {
      emit(await validateBooks(vault));
    });
}
