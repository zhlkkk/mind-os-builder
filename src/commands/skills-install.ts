import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { assetPath, packageRoot } from "../lib/assets.js";
import { MindosError } from "../lib/paths.js";
import { appliedResult, blockedResult, noopResult, previewResult, type CliResult } from "../lib/result.js";

const projectPaths = {
  codex: ".agents/skills",
  "claude-code": ".claude/skills",
  pi: ".pi/skills",
  openclaw: "skills",
  workbuddy: ".agents/skills",
} as const;

const userPaths = {
  codex: ".agents/skills",
  "claude-code": ".claude/skills",
  pi: ".pi/agent/skills",
  hermes: ".hermes/skills",
  openclaw: ".openclaw/skills",
  workbuddy: ".workbuddy/skills",
} as const;

type Host = keyof typeof userPaths;
type Scope = "project" | "user";

export type SkillsInstallOptions = {
  host: string;
  scope: Scope;
  project?: string;
  home?: string;
  apply?: boolean;
};

type InstallData = {
  source: string;
  destination: string;
  install: string[];
  unchanged: string[];
  conflicts: string[];
};

function isHost(value: string): value is Host {
  return Object.hasOwn(userPaths, value);
}

function destinationFor(host: string, scope: Scope, project: string, home: string): string {
  if (!isHost(host)) {
    throw new MindosError("mindos.input.invalid", "unsupported skill host");
  }
  if (scope !== "project" && scope !== "user") {
    throw new MindosError("mindos.input.invalid", "unsupported skill installation scope");
  }
  if (scope === "project") {
    if (host === "hermes") {
      throw new MindosError("mindos.input.unsupported_scope", "Hermes only supports user skill installation");
    }
    return resolve(project, projectPaths[host]);
  }
  return resolve(home, userPaths[host]);
}

async function lstatOrUndefined(path: string): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
  try {
    return await lstat(path);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function assertNoSymlinks(root: string): Promise<void> {
  const stat = await lstatOrUndefined(root);
  if (stat === undefined) {
    throw new MindosError("mindos.filesystem.invalid_root", "required Skill asset is missing");
  }
  if (stat.isSymbolicLink()) {
    throw new MindosError("mindos.filesystem.symlink", "Skill source contains a symbolic link");
  }
  if (!stat.isDirectory()) {
    return;
  }
  for (const entry of await readdir(root, { withFileTypes: true })) {
    await assertNoSymlinks(join(root, entry.name));
  }
}

async function projectPathHasSymlink(project: string, destination: string): Promise<boolean> {
  const root = resolve(project);
  const rel = relative(root, destination);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new MindosError("mindos.filesystem.invalid_root", "Skill destination escapes project root");
  }
  let current = root;
  for (const part of rel.split(sep)) {
    current = join(current, part);
    const stat = await lstatOrUndefined(current);
    if (stat === undefined) {
      return false;
    }
    if (stat.isSymbolicLink()) {
      return true;
    }
  }
  return false;
}

async function digest(root: string, omitRoles = false): Promise<string> {
  const hash = createHash("sha256");
  async function visit(path: string, relativePath: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const nextRelative = relativePath.length === 0 ? entry.name : `${relativePath}/${entry.name}`;
      const nextPath = join(path, entry.name);
      if (omitRoles && nextRelative === "references") {
        continue;
      }
      if (entry.isSymbolicLink()) {
        throw new MindosError("mindos.filesystem.symlink", "Skill tree contains a symbolic link");
      }
      hash.update(`${nextRelative}\0${entry.isDirectory() ? "directory" : "file"}\0`);
      if (entry.isDirectory()) {
        await visit(nextPath, nextRelative);
      } else {
        hash.update(await readFile(nextPath));
      }
      hash.update("\0");
    }
  }
  await visit(root, "");
  return hash.digest("hex");
}

async function sourceSkills(source: string): Promise<string[]> {
  await assertNoSymlinks(source);
  const names: string[] = [];
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const skill = join(source, entry.name);
    const skillFile = await lstatOrUndefined(join(skill, "SKILL.md"));
    if (entry.isDirectory() && skillFile?.isFile()) {
      names.push(entry.name);
    }
  }
  if (names.length === 0) {
    throw new MindosError("mindos.filesystem.invalid_root", "canonical Skill assets are empty");
  }
  return names.sort();
}

async function targetState(source: string, target: string, roles: string, name: string): Promise<"install" | "unchanged" | "conflict"> {
  const stat = await lstatOrUndefined(target);
  if (stat === undefined) {
    return "install";
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return "conflict";
  }
  try {
    await assertNoSymlinks(target);
    if (await digest(source) !== await digest(target, name === "distill")) {
      return "conflict";
    }
    if (name !== "distill") {
      return "unchanged";
    }
    const installedRoles = join(target, "references", "roles");
    const references = await readdir(join(target, "references"));
    if (references.length !== 1 || references[0] !== "roles") {
      return "conflict";
    }
    return await digest(roles) === await digest(installedRoles) ? "unchanged" : "conflict";
  } catch {
    return "conflict";
  }
}

async function materialize(source: string, name: string, destination: string, roles: string): Promise<void> {
  const staging = await mkdtemp(join(destination, `.mindos-${name}-`));
  const stagedSkill = join(staging, name);
  try {
    await chmod(staging, 0o700);
    await cp(join(source, name), stagedSkill, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
    if (name === "distill") {
      await assertNoSymlinks(roles);
      await mkdir(join(stagedSkill, "references"), { recursive: true, mode: 0o700 });
      await cp(roles, join(stagedSkill, "references", "roles"), { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true });
    }
    await assertNoSymlinks(stagedSkill);
    if ((await lstatOrUndefined(join(destination, name))) !== undefined) {
      throw new MindosError("mindos.state.conflict", "Skill target was created concurrently");
    }
    await rename(stagedSkill, join(destination, name));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

export async function installSkills(options: SkillsInstallOptions): Promise<CliResult> {
  const source = assetPath(".agents/skills");
  const project = options.project ?? process.cwd();
  const home = options.home ?? homedir();
  let destination = "";
  try {
    destination = destinationFor(options.host, options.scope, project, home);
    const data: InstallData = { source, destination, install: [], unchanged: [], conflicts: [] };
    if (options.scope === "project" && await projectPathHasSymlink(project, destination)) {
      return blockedResult("mindos.filesystem.symlink", "project Skill destination contains a symbolic link", data);
    }
    const names = await sourceSkills(source);
    const roles = join(packageRoot(), "agents", "roles");
    if (names.includes("distill")) {
      await assertNoSymlinks(roles);
    }
    for (const name of names) {
      const state = await targetState(join(source, name), join(destination, name), roles, name);
      data[state === "install" ? "install" : state === "unchanged" ? "unchanged" : "conflicts"].push(name);
    }
    if (data.conflicts.length > 0) {
      return blockedResult("mindos.state.conflict", "existing Skills have different content; nothing was written", data);
    }
    if (!options.apply) {
      return previewResult(data);
    }
    if (data.install.length === 0) {
      return noopResult(data);
    }
    await mkdir(destination, { recursive: true, mode: 0o700 });
    if (options.scope === "project" && await projectPathHasSymlink(project, destination)) {
      return blockedResult("mindos.filesystem.symlink", "project Skill destination contains a symbolic link", data);
    }
    for (const name of data.install) {
      await materialize(source, name, destination, roles);
    }
    return appliedResult(data, data.install.map((name) => ({ kind: "skill", path: join(destination, name) })));
  } catch (error: unknown) {
    const safe = error instanceof MindosError
      ? error
      : new MindosError("mindos.filesystem.install_failed", "Skill installation did not complete");
    return blockedResult(safe.code, safe.message, {
      source,
      destination: destination ?? "",
      install: [],
      unchanged: [],
      conflicts: [],
    });
  }
}
