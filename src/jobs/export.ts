import { isAbsolute } from "node:path";
import { MindosError } from "../lib/paths.js";
import type { CatalogJob } from "./catalog.js";

export type JobAdapter = "agent" | "cron" | "launchd";
export type JobExport = { adapter: JobAdapter; filename: string; media_type: string; content: string };
export type JobExportOptions = { adapter: string; inputs: string[]; executable?: string; schedule?: string };

function invalid(message: string): never { throw new MindosError("mindos.input.invalid", message); }
function hasControl(value: string): boolean { return [...value].some((character) => { const code = character.codePointAt(0) ?? 0; return code < 32 || code === 127; }); }

function bindInputs(job: CatalogJob, bindings: string[]): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const binding of bindings) {
    const separator = binding.indexOf("=");
    if (separator < 1) invalid("job input must use key=value");
    const key = binding.slice(0, separator); const value = binding.slice(separator + 1);
    if (!Object.hasOwn(job.inputs, key)) invalid(`job input is unknown: ${key}`);
    if (Object.hasOwn(resolved, key)) invalid(`job input is duplicated: ${key}`);
    if (value.length === 0 || value.length > 4096 || hasControl(value)) invalid(`job input is invalid: ${key}`);
    resolved[key] = value;
  }
  const missing = Object.keys(job.inputs).filter((key) => !Object.hasOwn(resolved, key));
  if (missing.length > 0) invalid(`job inputs are missing: ${missing.join(", ")}`);
  return resolved;
}

function commandFor(job: CatalogJob, inputs: Record<string, string>, executable?: string): string[] {
  if (job.command === undefined) invalid("system scheduler adapters require a command job; use the agent adapter for skill jobs");
  const command = job.command.map((token) => token.replace(/\{([^}]+)\}/gu, (_, key: string) => inputs[key] ?? invalid(`job input is missing: ${key}`)));
  if (executable !== undefined) {
    if (executable.length === 0 || executable.length > 4096 || hasControl(executable)) invalid("job executable is invalid");
    command[0] = executable;
  }
  return command;
}

const schedulePresets: Record<string, string> = { hourly: "0 * * * *", daily: "0 8 * * *", "twice-monthly": "0 8 1,15 * *" };

function cronSchedule(value: string | undefined): string {
  if (value === undefined || value === "manual") invalid("cron export requires a schedule");
  const schedule = schedulePresets[value] ?? value;
  const fields = schedule.trim().split(/\s+/u);
  if (fields.length !== 5 || fields.some((field) => !/^[0-9*,/-]+$/u.test(field))) invalid("cron schedule must be a preset or a five-field numeric expression");
  return fields.join(" ");
}

function requireExecutable(executable: string | undefined): string {
  if (executable === undefined || !isAbsolute(executable) || hasControl(executable)) invalid("system scheduler export requires an absolute --executable path");
  return executable;
}

function shellQuote(value: string): string { return `'${value.replaceAll("'", `'"'"'`)}'`; }
function xml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }

function exportCron(job: CatalogJob, inputs: Record<string, string>, options: JobExportOptions): JobExport {
  const command = commandFor(job, inputs, requireExecutable(options.executable));
  const content = `# Mind OS Job: ${job.id}\n${cronSchedule(options.schedule ?? job.schedule)} ${command.map(shellQuote).join(" ")}\n`;
  return { adapter: "cron", filename: `${job.id}.cron`, media_type: "text/plain", content };
}

function launchdSchedule(value: string | undefined): string {
  if (value === "hourly") return "  <key>StartInterval</key>\n  <integer>3600</integer>";
  if (value === "daily") return "  <key>StartCalendarInterval</key>\n  <dict><key>Hour</key><integer>8</integer><key>Minute</key><integer>0</integer></dict>";
  if (value === "twice-monthly") return "  <key>StartCalendarInterval</key>\n  <array><dict><key>Day</key><integer>1</integer><key>Hour</key><integer>8</integer></dict><dict><key>Day</key><integer>15</integer><key>Hour</key><integer>8</integer></dict></array>";
  return invalid("launchd schedule must be hourly, daily, or twice-monthly");
}

function exportLaunchd(job: CatalogJob, inputs: Record<string, string>, options: JobExportOptions): JobExport {
  const command = commandFor(job, inputs, requireExecutable(options.executable));
  const argumentsXml = command.map((token) => `    <string>${xml(token)}</string>`).join("\n");
  const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n  <key>Label</key>\n  <string>dev.mind-os-builder.job.${job.id}</string>\n  <key>ProgramArguments</key>\n  <array>\n${argumentsXml}\n  </array>\n${launchdSchedule(options.schedule ?? job.schedule)}\n</dict>\n</plist>\n`;
  return { adapter: "launchd", filename: `dev.mind-os-builder.job.${job.id}.plist`, media_type: "application/x-plist", content };
}

function exportAgent(job: CatalogJob, inputs: Record<string, string>, options: JobExportOptions): JobExport {
  if (job.command === undefined && options.executable !== undefined) invalid("skill jobs do not accept an executable override");
  const entry = job.command === undefined ? { skill: job.skill } : { command: commandFor(job, inputs, options.executable) };
  const schedule = options.schedule ?? job.schedule;
  if (schedule !== undefined && (schedule.length === 0 || schedule.length > 256 || hasControl(schedule))) invalid("agent schedule is invalid");
  const manifest = { version: "v1", job: { id: job.id, name: job.name, inputs, entry, effects: job.effects, concurrency: job.concurrency, retry: job.retry, ...(schedule === undefined ? {} : { schedule }) }, execution: { mode: "host-controlled", apply_authorized: false } };
  return { adapter: "agent", filename: `${job.id}.agent.json`, media_type: "application/json", content: `${JSON.stringify(manifest, null, 2)}\n` };
}

export function exportJob(job: CatalogJob, options: JobExportOptions): JobExport {
  const inputs = bindInputs(job, options.inputs);
  if (options.adapter === "cron") return exportCron(job, inputs, options);
  if (options.adapter === "launchd") return exportLaunchd(job, inputs, options);
  if (options.adapter === "agent") return exportAgent(job, inputs, options);
  return invalid("job adapter must be agent, cron, or launchd");
}
