import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

type Result = { ok: boolean; state: string; changed: boolean; data: Record<string, unknown>; error?: { code: string } };
const cli = join(process.cwd(), "lib/src/cli.js");

async function run(args: string[]): Promise<Result> {
  const output = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: ["ignore", "pipe", "pipe"] }); let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); }); child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({ stdout, stderr, code }));
  });
  assert.equal(output.stderr, ""); assert.ok(output.code === 0 || output.code === 1); return JSON.parse(output.stdout) as Result;
}

function report(overrides = ""): string {
  return `---\nversion: v1\ntopic: 合成协议\nmode: standard\nresearched_at: 2026-07-21\nevidence_status: complete\ntools:\n  - web-search\nsources:\n  - https://example.com/spec\n---\n# 合成协议技术调研\n\n## 1. 结论速览\n\n用于测试。\n\n${overrides}## 参考来源\n\n- https://example.com/spec\n`;
}

test("research commit 预演零写入、apply 原子新增且重复为 noop", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mindos-research-")); const vault = join(workspace, "vault"); const candidate = join(workspace, "candidate.md");
  await mkdir(vault); await writeFile(candidate, report()); const target = "raw/research/2026-07-21-synthetic.md";
  const preview = await run(["research", "commit", vault, candidate, "--target", target, "--json"]); assert.equal(preview.state, "preview");
  await assert.rejects(() => readFile(join(vault, target)));
  const applied = await run(["research", "commit", vault, candidate, "--target", target, "--apply", "--json"]); assert.equal(applied.state, "applied");
  assert.equal(await readFile(join(vault, target), "utf8"), report());
  const replay = await run(["research", "commit", vault, candidate, "--target", target, "--apply", "--json"]); assert.equal(replay.state, "noop");
  await writeFile(candidate, report("新增结论。\n\n"));
  const conflict = await run(["research", "commit", vault, candidate, "--target", target, "--apply", "--json"]); assert.equal(conflict.error?.code, "mindos.state.conflict");
});

test("research commit 拒绝无来源、非法 frontmatter、vault 内候选与路径逃逸", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mindos-research-invalid-")); const vault = join(workspace, "vault"); await mkdir(vault);
  const cases = [
    report().replace("  - https://example.com/spec\n", ""),
    report().replace("version: v1\n", "version: v1\nprovider_key: secret\n"),
    report().replace("## 参考来源", "## 资料"),
    report().replace("evidence_status: complete", "evidence_status: partial"),
    report().replace("https://example.com/spec", "https://user:secret@example.com/spec"),
  ];
  for (const [index, content] of cases.entries()) {
    const candidate = join(workspace, `bad-${index}.md`); await writeFile(candidate, content);
    const result = await run(["research", "commit", vault, candidate, "--target", `raw/research/bad-${index}.md`, "--json"]); assert.equal(result.ok, false);
  }
  const inside = join(vault, "candidate.md"); await writeFile(inside, report());
  assert.equal((await run(["research", "commit", vault, inside, "--target", "raw/research/inside.md", "--json"])).error?.code, "mindos.filesystem.protected_path");
  assert.equal((await run(["research", "commit", vault, join(workspace, "bad-0.md"), "--target", "wiki/concepts/report.md", "--json"])).error?.code, "mindos.filesystem.protected_path");
});

test("research commit 拒绝候选或目标符号链接", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mindos-research-link-")); const vault = join(workspace, "vault"); const source = join(workspace, "source.md"); const candidate = join(workspace, "candidate.md");
  await mkdir(vault); await writeFile(source, report()); await symlink(source, candidate);
  assert.equal((await run(["research", "commit", vault, candidate, "--target", "raw/research/link.md", "--json"])).error?.code, "mindos.input.invalid");
  await mkdir(join(vault, "raw")); await symlink(workspace, join(vault, "raw", "research")); await chmod(source, 0o600);
  assert.equal((await run(["research", "commit", vault, source, "--target", "raw/research/link.md", "--apply", "--json"])).error?.code, "mindos.filesystem.protected_path");
});
