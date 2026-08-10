import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const root = process.cwd();
const execFileAsync = promisify(execFile);

test("Twitter Digest Skill 安全清理本次 OpenCLI 空白窗口", async () => {
  const skill = await readFile(join(root, ".agents/skills/twitter-digest/SKILL.md"), "utf8");
  const cleanup = await readFile(join(root, ".agents/skills/twitter-digest/references/opencli-window-cleanup.md"), "utf8");

  assert.match(skill, /OpenCLI 窗口清理/);
  assert.match(skill, /scripts\/\.\.\..*相对于当前已加载.*Skill 安装目录.*绝不相对于 vault/u);
  for (const safeguard of [
    "trap cleanup_opencli_window EXIT",
    "beforeIds does not contain currentId",
    "count of tabs of chromeWindow",
    'is "about:blank"',
    "close chromeWindow",
  ]) {
    assert.match(cleanup, new RegExp(safeguard));
  }
  assert.doesNotMatch(cleanup, /quit application/i);
});

test("ego-browser 采集脚本原子生成受保护的 Provider JSON", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "mindos-twitter-ego-contract-"));
  context.after(async () => rm(temporary, { recursive: true, force: true }));
  const bin = join(temporary, "bin"); const vault = join(temporary, "vault"); const trustedRoot = join(temporary, "runs"); const invocations = join(temporary, "invocations.log"); await mkdir(bin); await mkdir(vault);
  const fakeEgo = join(bin, "ego-browser");
  await writeFile(fakeEgo, `#!/bin/sh
input="$(/bin/cat)"
task="$(printf '%s' "$input" | /usr/bin/sed -n "s/^const name = '\\([^']*\\)'.*/\\1/p" | /usr/bin/head -n 1)"
case "$input" in
  *completeTaskSpace*) printf 'complete:%s\\n' "$task" >> "$EGO_INVOCATIONS" ;;
  *) printf 'collect:%s\\n' "$task" >> "$EGO_INVOCATIONS"; printf '{"records":[{"id":"ego-one","title":"Browser capture","text":"Captured timeline item.","url":"https://x.com/tester/status/1","author":"tester"}]}\\n' >&2 ;;
esac
`, { mode: 0o700 });

  const script = join(root, ".agents/skills/twitter-digest/scripts/collect-ego-browser.sh");
  const workspace = join(root, ".agents/skills/twitter-digest/scripts/manage-run-workspace.sh");
  const env = { ...process.env, EGO_INVOCATIONS: invocations, MINDOS_TWITTER_RUN_ROOT: trustedRoot, PATH: `${bin}:${process.env.PATH ?? ""}` };
  const runDir = (await execFileAsync(workspace, ["create", vault], { env })).stdout.trim();
  const runId = runDir.slice(-32); const output = join(runDir, "capture.json");
  await execFileAsync(script, [output, runId], { env });

  assert.deepEqual(JSON.parse(await readFile(output, "utf8")), { records: [{
    id: "ego-one", title: "Browser capture", text: "Captured timeline item.",
    url: "https://x.com/tester/status/1", author: "tester",
  }] });
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.equal(await readFile(invocations, "utf8"), `collect:mindos-twitter-${runId}\ncomplete:mindos-twitter-${runId}\n`);
});

test("ego-browser 采集失败只输出受控且可操作的诊断", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "mindos-twitter-ego-error-"));
  context.after(async () => rm(temporary, { recursive: true, force: true }));
  const bin = join(temporary, "bin"); const vault = join(temporary, "vault"); const trustedRoot = join(temporary, "runs"); await mkdir(bin); await mkdir(vault);
  const fakeEgo = join(bin, "ego-browser");
  await writeFile(fakeEgo, `#!/bin/sh
printf '找不到 X 时间线标签：为你推荐/For you\nsecret-cookie=do-not-leak\n' >&2
exit 1
`, { mode: 0o700 });

  const script = join(root, ".agents/skills/twitter-digest/scripts/collect-ego-browser.sh");
  const workspace = join(root, ".agents/skills/twitter-digest/scripts/manage-run-workspace.sh");
  const env = { ...process.env, MINDOS_TWITTER_RUN_ROOT: trustedRoot, PATH: `${bin}:${process.env.PATH ?? ""}` };
  const runDir = (await execFileAsync(workspace, ["create", vault], { env })).stdout.trim(); const output = join(runDir, "capture.json");
  await assert.rejects(
    execFileAsync(script, [output, runDir.slice(-32)], { env }),
    (error: unknown) => {
      const failure = error as { stderr?: string };
      assert.match(failure.stderr ?? "", /找不到 X 时间线标签/u);
      assert.doesNotMatch(failure.stderr ?? "", /do-not-leak/u);
      return true;
    },
  );
  await assert.rejects(stat(output), { code: "ENOENT" });
});

test("ego-browser 拒绝向非受信工作区写入 capture", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "mindos-twitter-ego-path-"));
  context.after(async () => rm(temporary, { recursive: true, force: true }));
  const bin = join(temporary, "bin"); const invoked = join(temporary, "invoked"); await mkdir(bin);
  await writeFile(join(bin, "ego-browser"), `#!/bin/sh\nprintf invoked > "$EGO_INVOKED"\n`, { mode: 0o700 });
  const script = join(root, ".agents/skills/twitter-digest/scripts/collect-ego-browser.sh");
  await assert.rejects(execFileAsync(script, [join(temporary, "capture.json"), "3".repeat(32)], {
    env: { ...process.env, EGO_INVOKED: invoked, MINDOS_TWITTER_RUN_ROOT: join(temporary, "runs"), PATH: `${bin}:${process.env.PATH ?? ""}` },
  }));
  await assert.rejects(access(invoked), { code: "ENOENT" });
});

test("ego-browser 收尾失败不落盘且隐藏原始诊断", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "mindos-twitter-ego-complete-error-"));
  context.after(async () => rm(temporary, { recursive: true, force: true }));
  const bin = join(temporary, "bin"); const vault = join(temporary, "vault"); const trustedRoot = join(temporary, "runs"); await mkdir(bin); await mkdir(vault);
  await writeFile(join(bin, "ego-browser"), `#!/bin/sh
input="$(/bin/cat)"
case "$input" in
  *completeTaskSpace*) printf 'secret-cookie=do-not-leak\n' >&2; exit 1 ;;
  *) printf '{"records":[{"id":"ego-one","title":"Browser capture","text":"Captured timeline item.","url":"https://x.com/tester/status/1","author":"tester"}]}\n' >&2 ;;
esac
`, { mode: 0o700 });
  const script = join(root, ".agents/skills/twitter-digest/scripts/collect-ego-browser.sh");
  const workspace = join(root, ".agents/skills/twitter-digest/scripts/manage-run-workspace.sh");
  const env = { ...process.env, MINDOS_TWITTER_RUN_ROOT: trustedRoot, PATH: `${bin}:${process.env.PATH ?? ""}` };
  const runDir = (await execFileAsync(workspace, ["create", vault], { env })).stdout.trim(); const output = join(runDir, "capture.json");
  await assert.rejects(execFileAsync(script, [output, runDir.slice(-32)], { env }), (error: unknown) => {
    const failure = error as { stderr?: string };
    assert.match(failure.stderr ?? "", /任务空间收尾失败/u); assert.doesNotMatch(failure.stderr ?? "", /do-not-leak/u); return true;
  });
  await assert.rejects(stat(output), { code: "ENOENT" });
});

test("ego-browser 采集脚本拒绝非法运行 ID 且不会启动浏览器", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "mindos-twitter-ego-run-id-"));
  context.after(async () => rm(temporary, { recursive: true, force: true }));
  const bin = join(temporary, "bin"); const output = join(temporary, "twitter-ego.json"); const invoked = join(temporary, "invoked"); await mkdir(bin);
  await writeFile(join(bin, "ego-browser"), `#!/bin/sh\nprintf invoked > "$EGO_INVOKED"\n`, { mode: 0o700 });
  const script = join(root, ".agents/skills/twitter-digest/scripts/collect-ego-browser.sh");
  await assert.rejects(execFileAsync(script, [output, "shared"], { env: { ...process.env, EGO_INVOKED: invoked, PATH: `${bin}:${process.env.PATH ?? ""}` } }));
  await assert.rejects(access(invoked), { code: "ENOENT" });
});

test("Twitter Digest 用证据分级和批次复核提高筛选一致性但不设置配额", async () => {
  const skill = await readFile(join(root, ".agents/skills/twitter-digest/SKILL.md"), "utf8");
  const select = await readFile(join(root, ".agents/skills/twitter-digest/prompts/select.md"), "utf8");
  const review = await readFile(join(root, ".agents/skills/twitter-digest/prompts/review-batch.md"), "utf8");
  const rubric = await readFile(join(root, ".agents/skills/twitter-digest/references/selection-rubric.md"), "utf8");
  const assemble = await readFile(join(root, ".agents/skills/twitter-digest/prompts/assemble-decisions.md"), "utf8");

  for (const field of ["evidence_level", "reason_code", "borderline", "topic_fingerprint"]) assert.match(select, new RegExp(field));
  assert.match(skill, /批次一致性复核/u);
  assert.match(skill, /原生文件写入工具.*禁止用终端 heredoc.*输出重定向.*jq.*动态 Node\/Python/u);
  assert.match(review, /较弱证据.*保留.*较强证据.*拒绝/u);
  assert.match(review, /翻译忠实/u);
  assert.match(review, /分类/u);
  assert.match(review, /机械套壳/u);
  assert.match(rubric, /E0/u);
  assert.match(rubric, /E3/u);
  assert.match(rubric, /证据等级.*不能.*自动/u);
  assert.match(assemble, /不得写入.*evidence_level/u);
  assert.doesNotMatch(`${skill}\n${review}\n${rubric}`, /固定(?:保留|通过)(?:率|数量)|目标通过率/u);
});

test("Twitter 运行工作区按提交阶段清理或保留恢复材料", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "mindos-twitter-workspace-contract-"));
  context.after(async () => rm(temporary, { recursive: true, force: true }));
  const vault = join(temporary, "vault"); const trustedRoot = join(temporary, "runs"); await mkdir(vault);
  const script = join(root, ".agents/skills/twitter-digest/scripts/manage-run-workspace.sh");
  const env = { ...process.env, MINDOS_TWITTER_RUN_ROOT: trustedRoot };
  const run = (args: string[]) => execFileAsync(script, args, { env });
  const missing = async (path: string) => assert.rejects(access(path), { code: "ENOENT" });

  const first = (await run(["create", vault])).stdout.trim();
  assert.match(first, /\/run-[a-f0-9]{32}$/u);
  await assert.rejects(run(["create", vault]));
  assert.equal((await stat(trustedRoot)).mode & 0o777, 0o700);
  assert.equal((await stat(first)).mode & 0o777, 0o700);
  await writeFile(join(first, "capture.json"), "{}\n", { mode: 0o600 });
  await run(["transition", first, vault, "captured"]);
  const batch = "a".repeat(32); await run(["bind", first, vault, batch]);
  await missing(join(first, "capture.json"));
  const decisions = join(first, `decisions-twitter-${batch}.json`); await writeFile(decisions, "{}\n", { mode: 0o600 });
  for (const phase of ["reviewed", "previewed", "applying"]) await run(["transition", first, vault, phase]);
  await assert.rejects(run(["cleanup", first, vault]));
  assert.equal((await readFile(decisions, "utf8")).trim(), "{}");
  assert.match((await run(["recover", vault])).stdout, new RegExp(first.replaceAll("/", "\\/")));

  const recent = Math.floor(Date.now() / 1000); await run(["transition", first, vault, "applied", String(recent)]);
  await run(["prune", vault, String(recent)]); assert.equal((await stat(first)).isDirectory(), true);
  await run(["prune", vault, String(recent + 30 * 86_400 + 1)]); await missing(first);

  const second = (await run(["create", vault])).stdout.trim();
  assert.match((await run(["recover", vault])).stdout, new RegExp(second.replaceAll("/", "\\/")));
  await run(["cleanup", second, vault]); await missing(second);
  const overlapping = await Promise.allSettled([run(["create", vault]), run(["create", vault])]);
  assert.equal(overlapping.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(overlapping.filter((result) => result.status === "rejected").length, 1);
  const winner = overlapping.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof run>>> => result.status === "fulfilled");
  assert.ok(winner); await run(["cleanup", winner.value.stdout.trim(), vault]);
  const unknown = join(trustedRoot, "run-" + "b".repeat(32)); await mkdir(unknown);
  await run(["prune", vault, String(recent + 60 * 86_400)]); assert.equal((await stat(unknown)).isDirectory(), true);

  const source = await readFile(script, "utf8");
  assert.doesNotMatch(source, /python|\/tmp\/decisions\.json/iu);
  assert.doesNotMatch(source, /rm\s+-rf\s+[^"']*(?:\$\{?TMPDIR|\/tmp)/u);
});

test("Twitter 公开 Job 保持 OpenCLI，显式 ego-browser 终态只采集一次", async () => {
  const job = await readFile(join(root, "jobs/collect-twitter.yaml"), "utf8");
  const skill = await readFile(join(root, ".agents/skills/twitter-digest/SKILL.md"), "utf8");
  const collector = await readFile(join(root, ".agents/skills/twitter-digest/scripts/collect-ego-browser.sh"), "utf8");

  assert.match(job, /command: \[mindos, collect, twitter, prepare, "\{vault\}", --json\]/u);
  assert.doesNotMatch(job, /ego-browser|--provider|--input/u);
  assert.match(skill, /同一决策文件重放/u);
  assert.match(skill, /collect twitter audit/u);
  assert.match(skill, /日常任务不得再次实时采集/u);
  assert.match(skill, /转换为 applying/u);
  assert.match(skill, /转换为 applied/u);
  assert.match(skill, /不得用重定向、tee 或临时文件保存/u);
  assert.doesNotMatch(collector, /node\s+-e|mindos-twitter-ego-browser|python/iu);
  assert.match(collector, /const name = 'mindos-twitter-%s'/u);
  assert.match(collector, /时间线滚动停滞/u);
  assert.match(collector, /naturalEnd >= 3/u);
  assert.match(collector, /scrollState\.atBottom/u);
  assert.equal(collector.match(/completeTaskSpace/gu)?.length, 2);
});
