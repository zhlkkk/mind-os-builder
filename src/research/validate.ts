import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { relative, sep } from "node:path";
import { parse } from "yaml";
import { validateHttpUrl, validateMarkdown } from "../lib/input.js";
import { MindosError } from "../lib/paths.js";

export type ResearchMetadata = {
  version: "v1";
  topic: string;
  mode: "quick" | "standard" | "deep";
  researched_at: string;
  evidence_status: "complete" | "partial";
  tools: string[];
  sources: string[];
};

export type ResearchCandidate = { content: string; metadata: ResearchMetadata };

const fields = new Set(["version", "topic", "mode", "researched_at", "evidence_status", "tools", "sources"]);
const targetPattern = /^raw\/research\/[a-z0-9]+(?:-[a-z0-9]+)*\.md$/u;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;

function validDate(value: string): boolean {
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function stringList(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxItems
    || value.some((item) => typeof item !== "string" || item.trim().length === 0 || item.length > maxLength || /[\r\n]/u.test(item))) return undefined;
  const list = value.map((item) => (item as string).trim());
  return new Set(list).size === list.length ? list : undefined;
}

function parseMetadata(content: string): { metadata: ResearchMetadata; body: string } {
  if (!content.startsWith("---\n")) throw new MindosError("mindos.input.invalid", "research report is missing YAML frontmatter");
  const boundary = content.indexOf("\n---\n", 4);
  if (boundary < 0) throw new MindosError("mindos.input.invalid", "research report frontmatter is not closed");
  let value: unknown;
  if (boundary > 64 * 1024) throw new MindosError("mindos.input.invalid", "research report frontmatter is too large");
  try { value = parse(content.slice(4, boundary), { maxAliasCount: 0 }); } catch { throw new MindosError("mindos.input.invalid", "research report frontmatter is invalid"); }
  if (typeof value !== "object" || value === null || Array.isArray(value)
    || Object.keys(value).some((key) => !fields.has(key))) throw new MindosError("mindos.input.invalid", "research report frontmatter fields are invalid");
  const raw = value as Record<string, unknown>; const tools = stringList(raw.tools, 20, 128); const sources = stringList(raw.sources, 200, 2_048);
  if (raw.version !== "v1" || typeof raw.topic !== "string" || raw.topic.trim().length === 0 || raw.topic.length > 500 || /[\r\n]/u.test(raw.topic)
    || !["quick", "standard", "deep"].includes(String(raw.mode)) || typeof raw.researched_at !== "string" || !datePattern.test(raw.researched_at)
    || !validDate(raw.researched_at) || !["complete", "partial"].includes(String(raw.evidence_status))
    || tools === undefined || sources === undefined) throw new MindosError("mindos.input.invalid", "research report frontmatter values are invalid");
  for (const source of sources) validateHttpUrl(source);
  return { metadata: { version: "v1", topic: raw.topic.trim(), mode: raw.mode as ResearchMetadata["mode"], researched_at: raw.researched_at,
    evidence_status: raw.evidence_status as ResearchMetadata["evidence_status"], tools, sources }, body: content.slice(boundary + 5) };
}

export function validateResearchTarget(target: string): string {
  if (!targetPattern.test(target)) throw new MindosError("mindos.filesystem.protected_path", "research target must be raw/research/<slug>.md");
  return target;
}

export async function readResearchCandidate(vault: string, candidatePath: string): Promise<ResearchCandidate> {
  let candidate: string; let root: string;
  try {
    const metadata = await lstat(candidatePath);
    if (metadata.isSymbolicLink() || !metadata.isFile() || (await stat(candidatePath)).size > 512 * 1024) throw new Error();
    [candidate, root] = await Promise.all([realpath(candidatePath), realpath(vault)]);
  } catch { throw new MindosError("mindos.input.invalid", "research candidate must be a regular file no larger than 512 KiB"); }
  const fromRoot = relative(root, candidate);
  if (fromRoot === "" || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== "..")) {
    throw new MindosError("mindos.filesystem.protected_path", "research candidate must remain outside the vault");
  }
  const content = validateMarkdown(await readFile(candidate, "utf8"), 512 * 1024); const parsed = parseMetadata(content);
  const sourceSection = parsed.body.search(/^## 参考来源[ \t]*$/mu);
  if (!parsed.body.startsWith("# ") || sourceSection < 0
    || parsed.metadata.sources.some((source) => !parsed.body.slice(sourceSection).includes(source))
    || (parsed.metadata.evidence_status === "partial" && !/^## 证据缺口[ \t]*$/mu.test(parsed.body))) {
    throw new MindosError("mindos.input.invalid", "research report body is missing its title, source section, source URLs, or evidence gaps");
  }
  return { content, metadata: parsed.metadata };
}
