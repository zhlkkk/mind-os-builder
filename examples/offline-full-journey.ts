import { spawn } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Result = { version: "v1"; ok: boolean; state: string; data: Record<string, unknown>; artifacts: Array<{ path: string }> };

async function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<Result> {
  return new Promise((resolve, reject) => {
    const executable = command.endsWith(".js") ? process.execPath : command; const argv = command.endsWith(".js") ? [command, ...args] : args;
    const child = spawn(executable, argv, { env, stdio: ["ignore", "pipe", "pipe"] }); let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); }); child.stderr.resume();
    child.on("error", reject); child.on("close", () => {
      try { const result = JSON.parse(stdout) as Result; if (result.ok) resolve(result); else reject(new Error(JSON.stringify(result))); }
      catch (error: unknown) { reject(error instanceof Error ? error : new Error("CLI returned invalid JSON")); }
    });
  });
}

async function fakeProvider(path: string, payload: unknown): Promise<void> {
  await writeFile(path, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(payload))});\n`); await chmod(path, 0o700);
}

export async function runOfflineJourney(cli: string, vault: string, workspace: string): Promise<Record<string, unknown>> {
  const bin = join(workspace, "providers"); await mkdir(bin, { recursive: true });
  await fakeProvider(join(bin, "opencli"), { records: [{ id: "tweet-1", title: "Agent protocol benchmark", text: "Reproducible implementation and measurements.", url: "https://example.com/tweet-1", author: "synthetic" }] });
  await fakeProvider(join(bin, "folo"), { ok: true, data: { entries: [{ entries: { id: "rss-1", title: "Protocol release", content: "Official release notes.", url: "https://example.com/rss-1", author: "synthetic" } }] }, error: null });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` }; await mkdir(vault, { recursive: true });
  await run(cli, ["doctor", "--json"], env); await run(cli, ["wiki", "init", vault, "--apply", "--json"], env); await run(cli, ["books", "init", vault, "--apply", "--json"], env);
  for (const source of ["twitter", "rss"] as const) {
    const prepared = await run(cli, ["collect", source, "prepare", vault, "--json"], env); const candidates = prepared.data.candidates as Array<{ id: string; title: string }>;
    const category = Object.keys(prepared.data.categories as Record<string, string>)[0];
    const decisions = { version: "v1", batch_id: prepared.data.batch_id, baseline_hash: prepared.data.baseline_hash, decisions: candidates.map((item) => ({ id: item.id, decision: "keep", reason: "合成一手资料", display_title: source === "twitter" ? "智能体协议基准" : item.title, display_summary: "合成摘要。", translated: source === "twitter", category })) };
    const path = join(workspace, `${source}-decisions.json`); await writeFile(path, JSON.stringify(decisions)); await run(cli, ["collect", source, "commit", vault, path, "--apply", "--json"], env);
  }
  const journalRelative = "journals/2026-07-21.md"; const journal = join(vault, journalRelative); await writeFile(journal, "今天形成了一个判断。 #lumina\n\n下一步执行。 #vector\n");
  const scanned = await run(cli, ["distill", "scan", vault, journalRelative, "--json"], env); const triggers = scanned.data.triggers as Array<{ trigger_id: string; persona: "lumina" | "vector" }>;
  const headers = { lumina: "> [!quote] 🌿 Lumina (12:00)\n> 合成情绪映照。", vector: "> [!quote] 🔨 Vector (12:01)\n> - [ ] 执行合成动作。" };
  const responses = join(workspace, "responses.json"); await writeFile(responses, JSON.stringify({ version: "v1", baseline_hash: scanned.data.baseline_hash, responses: triggers.map((item) => ({ trigger_id: item.trigger_id, persona: item.persona, callout: headers[item.persona] })) }));
  await run(cli, ["distill", "commit", vault, journalRelative, responses, "--apply", "--json"], env);
  const candidate = join(workspace, "research.md"); await writeFile(candidate, "---\nversion: v1\ntopic: 合成协议\nmode: quick\nresearched_at: 2026-07-21\nevidence_status: complete\ntools:\n  - synthetic-search\nsources:\n  - https://example.com/spec\n---\n# 合成协议调研\n\n## 1. 结论速览\n\n离线合成结论。\n\n## 参考来源\n\n- https://example.com/spec\n");
  await run(cli, ["research", "commit", vault, candidate, "--target", "raw/research/2026-07-21-synthetic.md", "--apply", "--json"], env);
  const radarRelative = "wiki/concepts/tech-radar.md"; await writeFile(join(vault, radarRelative), "---\ndomain: ai\nsources: []\ncreated: 2026-01-01\nupdated: 2026-01-01\ntags: [radar]\n---\n# Tech Radar\n\n### 🟢 记录\n**合成技术**\n- 最新信号: 2026-01-01\n");
  const radar = await run(cli, ["radar", "prepare", vault, "--page", radarRelative, "--today", "2026-07-21", "--json"], env); const suggestions = radar.data.suggestions as Array<{ suggestion_id: string }>;
  const radarDecisions = join(workspace, "radar.json"); await writeFile(radarDecisions, JSON.stringify({ version: "v1", batch_id: radar.data.batch_id, baseline_hash: radar.data.baseline_hash, decisions: suggestions.map((item) => ({ suggestion_id: item.suggestion_id, decision: "approve" })) }));
  await run(cli, ["radar", "commit", vault, radarDecisions, "--apply", "--json"], env); const jobs = await run(cli, ["jobs", "list", "--json"], env);
  const host = join(workspace, "host"); await mkdir(host); await run(cli, ["skills", "install", "codex", "--scope", "project", "--project", host, "--apply", "--json"], env);
  return { version: "v1", vault, jobs: jobs.data.count, completed: ["doctor", "skills", "wiki", "books", "twitter", "rss", "distill", "research", "radar", "jobs"] };
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const vaultIndex = process.argv.indexOf("--vault"); const vault = vaultIndex >= 0 ? process.argv[vaultIndex + 1] : undefined;
  if (vault === undefined) throw new Error("用法：offline-full-journey --vault <空目录>");
  const workspace = join(vault, "..", `.mindos-offline-${String(process.pid)}`); await mkdir(workspace, { recursive: true });
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url)); process.stdout.write(`${JSON.stringify(await runOfflineJourney(cli, vault, workspace))}\n`);
}
