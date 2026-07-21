import { readFile, stat } from "node:fs/promises";
import { MindosError, resolveReadPath } from "../lib/paths.js";
import { contentHash } from "../lib/write.js";

export const PERSONAS = ["lumina", "prism", "vector", "nexus", "ember"] as const;
export type Persona = typeof PERSONAS[number];
export type Paragraph = { text: string; start: number; end: number };
export type DistillTrigger = {
  trigger_id: string;
  persona: Persona;
  source_path: string;
  paragraph: string;
  paragraph_occurrence: number;
  context: { before: string[]; after: string[] };
  concurrency_key: string;
  book_slug?: string;
  mode?: "light" | "deep";
};
export type DistillScan = { source_path: string; baseline_hash: string; triggers: DistillTrigger[] };

const TAG_PATTERN = /#(?:(book\/(?<bookSlug>[\w-]+))|(?<persona>lumina|prism|vector|nexus|ember))(?![\w/-])/gu;
const CALLOUT_HEADERS: Record<Persona, RegExp> = {
  lumina: /^\s*> \[!quote\] 🌿 Lumina\b/mu,
  prism: /^\s*> \[!quote\] 🌌 Prism\b/mu,
  vector: /^\s*> \[!quote\] 🔨 Vector\b/mu,
  nexus: /^\s*> \[!info\] 🌐 Nexus\b/mu,
  ember: /^\s*> \[!quote\] 🔥 Ember\b/mu,
};

export function normalizeParagraph(paragraph: string): string {
  return paragraph.trim().split("\n").map((line) => line.trimEnd()).join("\n");
}

export function splitParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const pattern = /(?:^|\n[ \t]*\n)(?<text>[^\n][\s\S]*?)(?=\n[ \t]*\n|$)/gu;
  for (const match of content.matchAll(pattern)) {
    const text = match.groups?.text?.replace(/\n+$/u, "");
    if (text === undefined || match.index === undefined) continue;
    const start = match.index + match[0].indexOf(match.groups?.text ?? text);
    paragraphs.push({ text, start, end: start + text.length });
  }
  return paragraphs;
}

export function adjacentCallouts(paragraphs: readonly Paragraph[], index: number): Set<Persona> {
  const personas = new Set<Persona>();
  for (const paragraph of paragraphs.slice(index + 1)) {
    if (!paragraph.text.trimStart().startsWith("> [!")) break;
    for (const persona of PERSONAS) {
      if (CALLOUT_HEADERS[persona].test(paragraph.text)) personas.add(persona);
    }
  }
  return personas;
}

function triggerId(source: string, paragraph: string, persona: Persona, occurrence: number): string {
  const payload = `v1\0${source}\0${paragraph}\0${persona}\0${String(occurrence)}`;
  return `distill:v1:${contentHash(Buffer.from(payload, "utf8")).slice(0, 20)}`;
}

export function scanContent(source: string, content: string): DistillScan {
  const paragraphs = splitParagraphs(content);
  const triggers: DistillTrigger[] = [];
  const occurrences = new Map<string, number>();
  for (const [index, paragraph] of paragraphs.entries()) {
    const personas: Persona[] = [];
    let bookSlug: string | undefined;
    for (const match of paragraph.text.matchAll(TAG_PATTERN)) {
      const persona = match.groups?.bookSlug === undefined ? match.groups?.persona as Persona : "ember";
      if (match.groups?.bookSlug !== undefined) bookSlug = match.groups.bookSlug;
      if (!personas.includes(persona)) personas.push(persona);
    }
    const normalized = normalizeParagraph(paragraph.text);
    const processed = adjacentCallouts(paragraphs, index);
    for (const persona of personas) {
      const occurrenceKey = `${persona}\0${normalized}`;
      const occurrence = occurrences.get(occurrenceKey) ?? 0;
      occurrences.set(occurrenceKey, occurrence + 1);
      if (processed.has(persona)) continue;
      const id = triggerId(source, normalized, persona, occurrence);
      triggers.push({
        trigger_id: id,
        persona,
        source_path: source,
        paragraph: paragraph.text,
        paragraph_occurrence: occurrence,
        context: {
          before: paragraphs.slice(Math.max(0, index - 2), index).map((item) => item.text),
          after: paragraphs.slice(index + 1, index + 2).map((item) => item.text),
        },
        concurrency_key: persona === "ember" ? `distill:${source}:ember` : id,
        ...(persona === "ember" && bookSlug !== undefined ? { book_slug: bookSlug } : {}),
        ...(persona === "nexus" ? { mode: /调研|深度|研报|competitive/iu.test(paragraph.text) ? "deep" as const : "light" as const } : {}),
      });
    }
  }
  return { source_path: source, baseline_hash: contentHash(Buffer.from(content, "utf8")), triggers };
}

export async function readJournal(root: string, source: string): Promise<{ content: string; path: string }> {
  if (!/^journals\/(?:[^/]+\/)*[^/]+\.md$/u.test(source)) {
    throw new MindosError("mindos.filesystem.protected_path", "distill only accepts vault-relative journals/*.md paths");
  }
  const path = await resolveReadPath(root, source);
  let metadata;
  try {
    metadata = await stat(path);
  } catch {
    throw new MindosError("mindos.input.invalid", "journal does not exist");
  }
  if (!metadata.isFile() || metadata.size > 8 * 1024 * 1024) {
    throw new MindosError("mindos.input.invalid", "journal is invalid or too large");
  }
  return { content: await readFile(path, "utf8"), path };
}

export async function scanJournal(root: string, source: string): Promise<DistillScan> {
  const { content } = await readJournal(root, source);
  return scanContent(source, content);
}
