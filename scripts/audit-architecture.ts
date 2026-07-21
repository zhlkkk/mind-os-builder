import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd(); const core: string[] = [];
async function walk(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name); const rel = relative(root, target).replaceAll("\\", "/");
    if (entry.isDirectory()) await walk(target);
    else if (entry.isFile() && entry.name.endsWith(".ts") && rel !== "src/cli.ts" && !rel.startsWith("src/commands/") && !rel.startsWith("src/mcp/")) core.push(target);
  }
}
await walk(join(root, "src")); const contents = await Promise.all(core.map((path) => readFile(path, "utf8"))); const lines = contents.reduce((sum, content) => sum + content.split("\n").filter((line) => line.trim().length > 0).length, 0);
if (lines > 2_500) throw new Error(`核心 TypeScript 非空行 ${String(lines)}，超过 2500`);
const source = contents.join("\n"); for (const symbol of ["ActionRegistry", "ActionDispatcher", "JobRunner", "RunStore", "ProviderFactory"]) if (source.includes(symbol)) throw new Error(`发现禁止架构符号 ${symbol}`);
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
if (Object.keys(pkg.dependencies ?? {}).length > 3) throw new Error("核心 Runtime 依赖超过三个");
process.stdout.write(`${JSON.stringify({ ok: true, core_typescript_lines: lines, core_dependencies: Object.keys(pkg.dependencies ?? {}) })}\n`);
