import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cli = join(process.cwd(), "lib", "src", "cli.js");

type InstallResult = {
  version: string;
  ok: boolean;
  state: "preview" | "applied" | "noop" | "blocked";
  changed: boolean;
  data: {
    destination: string;
    install: string[];
    unchanged: string[];
    conflicts: string[];
  };
  error?: { code: string; message: string };
};

type Invocation = {
  code: number;
  stderr: string;
  result: InstallResult;
};

const projectHosts = {
  codex: ".agents/skills",
  "claude-code": ".claude/skills",
  pi: ".pi/skills",
  openclaw: "skills",
  workbuddy: ".agents/skills",
} as const;

const userHosts = {
  codex: ".agents/skills",
  "claude-code": ".claude/skills",
  pi: ".pi/agent/skills",
  hermes: ".hermes/skills",
  openclaw: ".openclaw/skills",
  workbuddy: ".workbuddy/skills",
} as const;

async function invoke(
  host: string,
  scope: string,
  project: string,
  home: string,
  apply = false,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Invocation> {
  const arguments_ = [
    cli,
    "skills",
    "install",
    host,
    "--scope",
    scope,
    "--project",
    project,
    "--home",
    home,
    "--json",
  ];
  if (apply) {
    arguments_.push("--apply");
  }

  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, arguments_, { env });
    return { code: 0, stderr, result: JSON.parse(stdout) as InstallResult };
  } catch (error: unknown) {
    const failed = error as { code?: number; stdout?: string; stderr?: string };
    if (failed.stdout === undefined || failed.stdout.length === 0) {
      throw new Error(`CLI 未返回 JSON：${failed.stderr ?? ""}`);
    }
    return {
      code: failed.code ?? 1,
      stderr: failed.stderr ?? "",
      result: JSON.parse(failed.stdout ?? "{}") as InstallResult,
    };
  }
}

async function temporaryDirectory(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function sourceSkillNames(): Promise<string[]> {
  const names = await readdir(join(process.cwd(), ".agents", "skills"));
  return names.sort();
}

test("六个宿主均按原生路径 preview、apply 与 noop", async () => {
  const root = await temporaryDirectory("mindos-skills-hosts-");
  try {
    const names = await sourceSkillNames();
    for (const [host, relative] of Object.entries(projectHosts)) {
      const project = join(root, `project-${host}`);
      const home = join(root, `home-${host}`);
      await mkdir(project, { recursive: true });
      const preview = await invoke(host, "project", project, home);
      assert.equal(preview.code, 0);
      assert.equal(preview.result.state, "preview");
      assert.equal(preview.result.changed, false);
      assert.deepEqual(preview.result.data.install, names);
      assert.equal(existsSync(join(project, relative)), false);

      const applied = await invoke(host, "project", project, home, true);
      assert.equal(applied.code, 0);
      assert.equal(applied.result.state, "applied");
      assert.equal(applied.result.changed, true);
      assert.equal(existsSync(join(project, relative, "distill", "SKILL.md")), true);

      const repeated = await invoke(host, "project", project, home, true);
      assert.equal(repeated.code, 0);
      assert.equal(repeated.result.state, "noop");
      assert.deepEqual(repeated.result.data.unchanged, names);
    }

    for (const [host, relative] of Object.entries(userHosts)) {
      const project = join(root, `unused-${host}`);
      const home = join(root, `user-${host}`);
      await mkdir(home, { recursive: true });
      const applied = await invoke(host, "user", project, home, true);
      assert.equal(applied.code, 0);
      assert.equal(applied.result.state, "applied");
      assert.equal(existsSync(join(home, relative, "distill", "SKILL.md")), true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Hermes 项目级安装、冲突与项目符号链接均安全阻止", async () => {
  const root = await temporaryDirectory("mindos-skills-blocked-");
  try {
    const project = join(root, "project");
    const home = join(root, "home");
    await mkdir(project, { recursive: true });

    const hermes = await invoke("hermes", "project", project, home);
    assert.equal(hermes.code, 1);
    assert.equal(hermes.result.state, "blocked");
    assert.equal(hermes.result.error?.code, "mindos.input.unsupported_scope");

    const invalidScope = await invoke("codex", "invalid", project, home);
    assert.equal(invalidScope.code, 1);
    assert.equal(invalidScope.result.state, "blocked");
    assert.equal(invalidScope.result.error?.code, "mindos.input.invalid");

    const conflict = join(project, ".pi", "skills", "distill");
    await mkdir(conflict, { recursive: true });
    await writeFile(join(conflict, "SKILL.md"), "用户已有 Skill\n", "utf8");
    const blocked = await invoke("pi", "project", project, home, true);
    assert.equal(blocked.code, 1);
    assert.equal(blocked.result.state, "blocked");
    assert.deepEqual(blocked.result.data.conflicts, ["distill"]);
    assert.equal(await readFile(join(conflict, "SKILL.md"), "utf8"), "用户已有 Skill\n");
    assert.equal(existsSync(join(project, ".pi", "skills", "mind-os")), false);

    const symlinkProject = join(root, "symlink-project");
    const outside = join(root, "outside");
    await mkdir(symlinkProject, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(symlinkProject, ".agents"));
    const symlinked = await invoke("codex", "project", symlinkProject, home, true);
    assert.equal(symlinked.code, 1);
    assert.equal(symlinked.result.error?.code, "mindos.filesystem.symlink");
    assert.deepEqual(await readdir(outside), []);

    const linkedRoot = join(root, "linked-project");
    await symlink(outside, linkedRoot);
    const linkedRootResult = await invoke("codex", "project", linkedRoot, home, true);
    assert.equal(linkedRootResult.code, 1);
    assert.equal(linkedRootResult.result.error?.code, "mindos.filesystem.symlink");
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("用户显式宿主符号链接可用，只有 Distill 物化角色", async () => {
  const root = await temporaryDirectory("mindos-skills-user-link-");
  try {
    const home = join(root, "home");
    const configured = join(root, "configured");
    await mkdir(home, { recursive: true });
    await mkdir(configured, { recursive: true });
    await symlink(configured, join(home, ".agents"));

    const applied = await invoke("codex", "user", join(root, "unused"), home, true);
    assert.equal(applied.code, 0);
    assert.equal(applied.result.state, "applied");
    const roles = await readdir(join(configured, "skills", "distill", "references", "roles"));
    assert.deepEqual(roles.sort(), ["ember.md", "lumina.md", "nexus.md", "prism.md", "vector.md"]);
    assert.equal(existsSync(join(configured, "skills", "mind-os", "references", "roles")), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("源目录符号链接被拒绝，两个安装进程不会留下暂存目录", async () => {
  const root = await temporaryDirectory("mindos-skills-source-link-");
  try {
    const packageRoot = join(root, "package");
    const sourceSkill = join(packageRoot, ".agents", "skills", "demo");
    const outside = join(root, "outside.md");
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(join(packageRoot, "package.json"), "{}\n", "utf8");
    await writeFile(outside, "外部内容\n", "utf8");
    await symlink(outside, join(sourceSkill, "SKILL.md"));
    const home = join(root, "home");
    const rejected = await invoke(
      "codex",
      "user",
      join(root, "project"),
      home,
      true,
      { ...process.env, MINDOS_ASSET_ROOT: packageRoot },
    );
    assert.equal(rejected.code, 1);
    assert.equal(rejected.result.error?.code, "mindos.filesystem.symlink");

    await rm(sourceSkill, { recursive: true, force: true });
    const distill = join(packageRoot, ".agents", "skills", "distill");
    const roleSource = join(root, "role-source");
    await mkdir(distill, { recursive: true });
    await mkdir(roleSource, { recursive: true });
    await writeFile(join(distill, "SKILL.md"), "# Distill\n", "utf8");
    await writeFile(join(roleSource, "lumina.md"), "角色\n", "utf8");
    await mkdir(join(packageRoot, "agents"), { recursive: true });
    await symlink(roleSource, join(packageRoot, "agents", "roles"));
    const rejectedRoles = await invoke(
      "codex",
      "user",
      join(root, "project"),
      home,
      false,
      { ...process.env, MINDOS_ASSET_ROOT: packageRoot },
    );
    assert.equal(rejectedRoles.code, 1);
    assert.equal(rejectedRoles.result.error?.code, "mindos.filesystem.symlink");

    const project = join(root, "concurrent-project");
    await mkdir(project, { recursive: true });
    const [first, second] = await Promise.all([
      invoke("claude-code", "project", project, home, true),
      invoke("claude-code", "project", project, home, true),
    ]);
    assert.equal([first.result.state, second.result.state].includes("applied"), true);
    assert.equal(existsSync(join(project, ".claude", "skills", "distill", "SKILL.md")), true);
    const temporary = await readdir(join(project, ".claude", "skills"));
    assert.equal(temporary.some((name) => name.startsWith(".mindos-")), false);
    await chmod(join(project, ".claude", "skills"), 0o700);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
