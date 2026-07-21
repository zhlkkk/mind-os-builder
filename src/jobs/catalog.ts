import { access, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Ajv } from "ajv";
import { parse } from "yaml";
import { assetPath, readAssetTree } from "../lib/assets.js";
import { MindosError } from "../lib/paths.js";

export type Job = {
  version: "v1"; name: string; inputs: Record<string, string>; command?: string[]; skill?: string;
  effects: string[]; concurrency: "single" | "parallel"; retry: { max_attempts: number }; schedule?: string;
};
export type CatalogJob = Job & { id: string };

function invalid(message: string): never { throw new MindosError("mindos.input.invalid", message); }

async function allowedCommands(): Promise<Set<string>> {
  const descriptor = parse(await readFile(join(assetPath("contracts"), "commands.yaml"), "utf8")) as { commands?: Array<{ name?: unknown }> };
  return new Set((descriptor.commands ?? []).flatMap((item) => typeof item.name === "string" ? [item.name] : []));
}

function validateBindings(job: Job): void {
  for (const token of job.command ?? []) {
    for (const match of token.matchAll(/\{([^}]+)\}/gu)) if (!Object.hasOwn(job.inputs, match[1] ?? "")) invalid("job command contains an unknown input binding");
  }
}

export async function loadJobs(): Promise<CatalogJob[]> {
  const schema = JSON.parse(await readFile(join(assetPath("contracts"), "job.schema.json"), "utf8")) as object;
  const validate = new Ajv({ allErrors: true }).compile(schema); const commands = await allowedCommands(); const jobs: CatalogJob[] = [];
  for (const file of await readAssetTree(assetPath("jobs"))) {
    if (!file.relative.endsWith(".yaml")) continue;
    const value: unknown = parse(Buffer.from(file.content).toString("utf8"));
    if (!validate(value)) invalid(`job ${file.relative} does not match v1 schema`);
    const job = value as Job; validateBindings(job);
    if (job.command !== undefined) {
      const command = job.command.slice(1).filter((token) => !token.startsWith("-") && !token.includes("{")).join(".");
      if (job.command[0] !== "mindos" || !commands.has(command)) invalid(`job ${file.relative} references an unknown command`);
    } else if (job.skill !== undefined) {
      await access(join(assetPath(".agents/skills"), job.skill.replace(".agents/skills/", ""))).catch(() => invalid(`job ${file.relative} references a missing skill`));
    }
    jobs.push({ id: basename(file.relative, ".yaml"), ...job });
  }
  return jobs.sort((left, right) => left.id.localeCompare(right.id));
}

export async function loadJob(id: string): Promise<CatalogJob> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) invalid("job id is invalid");
  const job = (await loadJobs()).find((item) => item.id === id);
  if (job === undefined) invalid("job does not exist");
  return job;
}
