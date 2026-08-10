import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.cwd(); const files: string[] = [];
const roots = [".agents", "agents", "adapters", "contracts", "data", "docs", "examples", "jobs", "scripts", "src"];
async function walk(path: string): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const target = join(path, entry.name); const rel = relative(root, target).replaceAll("\\", "/");
    if (rel.startsWith("docs/plans/") || rel.includes("node_modules") || rel.includes(".venv") || rel.includes("lib/")) continue;
    if (entry.isDirectory()) await walk(target); else if (entry.isFile()) files.push(rel);
  }
}
for (const name of roots) { try { if ((await stat(join(root, name))).isDirectory()) await walk(join(root, name)); } catch { /* optional public directory */ } }
for (const name of ["README.md", "AGENTS.md", "LICENSE", "package.json", "package-lock.json", "tsconfig.json"]) files.push(name);
const forbiddenFile = /(?:^|\/)(?:pyproject\.toml|uv\.lock|[^/]+\.py|[^/]+\.pyc)$/u; const privatePath = /\/Users\/[A-Za-z0-9._-]+\//u; const credential = /(?:sk-|tvly-|pplx-|AIza)[A-Za-z0-9_-]{16,}/u;
for (const file of files) {
  if (forbiddenFile.test(file)) throw new Error(`发布源包含 Python 路径：${file}`);
  const path = join(root, file); if ((await stat(path)).size > 2 * 1024 * 1024) continue; const content = await readFile(path, "utf8");
  if (privatePath.test(content)) throw new Error(`发布源包含私人绝对路径：${file}`);
  if (credential.test(content)) throw new Error(`发布源包含疑似凭证：${file}`);
  if (file.startsWith("src/") && /(?:prompts?|提示词)[/\\]/iu.test(file)) throw new Error(`提示词进入生产源码：${file}`);
  if (file.startsWith(".agents/skills/twitter-digest/") || file === "jobs/collect-twitter.yaml") {
    const forbiddenTwitterRuntime = [
      { pattern: /(?:^|[\s;|&])(?:python3?|uv)(?:\s|$)/u, label: "Python 命令" },
      { pattern: /node\s+-e/u, label: "裸 Node eval" },
      { pattern: /mindos-twitter-ego-browser/u, label: "固定 ego-browser 任务空间" },
      { pattern: /\/tmp\/(?:decisions\.json|[^\s]*(?:audit|prepare)[^\s]*)/u, label: "无主临时文件" },
      { pattern: /rm\s+-rf[^\n]*(?:\$\{?TMPDIR|\/tmp)/u, label: "宽泛临时目录删除" },
    ];
    for (const forbidden of forbiddenTwitterRuntime) if (forbidden.pattern.test(content)) throw new Error(`Twitter 生产契约包含${forbidden.label}：${file}`);
  }
}
const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { files: string[] }; const packageFiles: string[] = [];
async function addPackagePath(path: string): Promise<void> {
  const metadata = await stat(path); if (metadata.isFile()) { packageFiles.push(relative(root, path).replaceAll("\\", "/")); return; }
  for (const entry of await readdir(path)) await addPackagePath(join(path, entry));
}
for (const item of pkg.files.filter((value) => !value.startsWith("!"))) { try { await addPackagePath(join(root, item)); } catch { /* an optional build asset may be absent before build */ } }
for (const required of ["README.md", "LICENSE", "AGENTS.md", "package.json"]) if (!packageFiles.includes(required)) packageFiles.push(required);
const excluded = (file: string) => file.startsWith("tests/") || file.startsWith("private/") || file.startsWith("raw/") || file.startsWith("docs/plans/") || file.includes("/__pycache__/") || file.endsWith(".pyc");
packageFiles.splice(0, packageFiles.length, ...packageFiles.filter((file) => !excluded(file)));
for (const file of packageFiles) if (forbiddenFile.test(file) || file.startsWith("tests/") || file.startsWith("private/") || file.startsWith("raw/")) throw new Error(`tarball 包含禁止路径：${file}`);
process.stdout.write(`${JSON.stringify({ ok: true, source_files: files.length, package_files: packageFiles.length })}\n`);
