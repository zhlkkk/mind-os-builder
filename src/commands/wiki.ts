import { readFile, stat } from "node:fs/promises";
import type { Command } from "commander";
import { MindosError } from "../lib/paths.js";
import { validateMarkdown } from "../lib/input.js";
import { blockedFromError, type CliResult } from "../lib/result.js";
import { initializeWiki } from "../wiki/init.js";
import { lintWiki } from "../wiki/lint.js";
import { ingestWikiPage, queryWiki } from "../wiki/pages.js";

type Emit = (result: CliResult) => void;

export function registerWikiCommands(program: Command, emit: Emit): void {
  const wiki = program.command("wiki").description("本地 Wiki 的确定性操作");
  wiki.command("init <vault>")
    .option("--apply", "写入 vault")
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string, options: { apply?: boolean }) => {
      emit(await initializeWiki(vault, options.apply === true));
    });
  wiki.command("lint <vault>")
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string) => {
      emit(await lintWiki(vault));
    });
  wiki.command("ingest <vault> <path> <candidate>")
    .option("--expected-hash <hash>", "当前页面的 SHA-256 基线")
    .option("--apply", "写入 vault")
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string, path: string, candidate: string, options: { expectedHash?: string; apply?: boolean }) => {
      try {
        const metadata = await stat(candidate);
        if (!metadata.isFile() || metadata.size > 256 * 1024) {
          throw new MindosError("mindos.input.invalid", "candidate page is not a safe Markdown file");
        }
        const content = await readFile(candidate, "utf8");
        validateMarkdown(content);
        emit(await ingestWikiPage(vault, path, content, options.expectedHash, options.apply === true));
      } catch (error: unknown) {
        const safe = error instanceof MindosError ? error : new MindosError("mindos.input.invalid", "cannot read candidate page");
        emit(blockedFromError(safe, { path }));
      }
    });
  wiki.command("query <vault> <query>")
    .option("--limit <count>", "最多返回的命中数", "10")
    .option("--json", "输出版本化 JSON")
    .action(async (vault: string, query: string, options: { limit: string }) => {
      emit(await queryWiki(vault, query, Number(options.limit)));
    });
}
