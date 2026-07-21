import { acquireVaultLock } from "../lib/lock.js";
import { MindosError } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { type DistillResponseInput, validateResponseCoverage } from "./responses.js";
import { normalizeParagraph, readJournal, scanContent, splitParagraphs, type DistillTrigger, type Persona } from "./scan.js";

export type DistillCommitOutcome = {
  changed: boolean;
  data: Record<string, unknown>;
  artifacts: Array<{ kind: string; path: string }>;
};

const HEADER_TEXT: Record<Persona, string> = {
  lumina: "> [!quote] 🌿 Lumina ",
  prism: "> [!quote] 🌌 Prism ",
  vector: "> [!quote] 🔨 Vector ",
  nexus: "> [!info] 🌐 Nexus ",
  ember: "> [!quote] 🔥 Ember ",
};

function stripApplied(content: string, input: DistillResponseInput): { baseline: string; applied: Set<string> } {
  const responseById = new Map(input.responses.map((response) => [response.trigger_id, response]));
  const removals: Array<{ start: number; end: number; id: string }> = [];
  for (const paragraph of splitParagraphs(content)) {
    const lines = paragraph.text.split("\n").map((line) => line.trimStart());
    const markerLine = lines.find((line) => /^> <!-- mindos:distill:distill:v1:[a-f0-9]{20} -->$/u.test(line));
    if (markerLine === undefined) continue;
    const id = markerLine.slice("> <!-- mindos:distill:".length, -" -->".length);
    const response = responseById.get(id);
    if (response === undefined || !(lines[0] ?? "").startsWith(HEADER_TEXT[response.persona])) continue;
    const separator = /\n[ \t]*\n$/u.exec(content.slice(0, paragraph.start));
    const start = separator === null ? paragraph.start : paragraph.start - separator[0].length;
    removals.push({ start, end: paragraph.end, id });
  }
  let baseline = content;
  for (const removal of removals.sort((left, right) => right.start - left.start)) {
    baseline = baseline.slice(0, removal.start) + baseline.slice(removal.end);
  }
  return { baseline, applied: new Set(removals.map((item) => item.id)) };
}

function findParagraphEnd(content: string, trigger: DistillTrigger): number {
  const matches = splitParagraphs(content).filter((paragraph) => normalizeParagraph(paragraph.text) === normalizeParagraph(trigger.paragraph));
  const paragraph = matches[trigger.paragraph_occurrence];
  if (paragraph === undefined) throw new MindosError("mindos.state.conflict", "trigger paragraph changed after scan");
  return paragraph.end;
}

function calloutIndent(paragraph: string): string {
  const first = paragraph.split("\n")[0] ?? "";
  const match = /^(?<indent>[ \t]*)(?:[-+*]|\d+[.)])\s+/u.exec(first);
  if (match?.groups?.indent === undefined) return "";
  return match.groups.indent.includes("\t") ? `${match.groups.indent}\t` : `${match.groups.indent}    `;
}

async function evaluate(root: string, source: string, input: DistillResponseInput, apply: boolean): Promise<DistillCommitOutcome> {
  const { content } = await readJournal(root, source);
  const stripped = stripApplied(content, input);
  if (contentHash(Buffer.from(stripped.baseline, "utf8")) !== input.baseline_hash) {
    throw new MindosError("mindos.state.conflict", "journal baseline changed after scan");
  }
  const scan = scanContent(source, stripped.baseline);
  const ordered = validateResponseCoverage(scan.triggers, input);
  const pending = ordered.filter((response) => !stripped.applied.has(response.trigger_id));
  const data = {
    source_path: source,
    baseline_hash: input.baseline_hash,
    planned_trigger_ids: ordered.map((item) => item.trigger_id),
    applied_trigger_ids: apply ? pending.map((item) => item.trigger_id) : [],
    skipped_trigger_ids: ordered.filter((item) => stripped.applied.has(item.trigger_id)).map((item) => item.trigger_id),
  };
  if (pending.length === 0) return { changed: false, data: { ...data, replay: true }, artifacts: [] };
  if (!apply) return { changed: true, data, artifacts: [{ kind: "journal", path: source }] };

  const triggerById = new Map(scan.triggers.map((trigger) => [trigger.trigger_id, trigger]));
  const order = new Map(scan.triggers.map((trigger, index) => [trigger.trigger_id, index]));
  const insertions = pending.map((response) => {
    const trigger = triggerById.get(response.trigger_id);
    if (trigger === undefined) throw new MindosError("mindos.state.conflict", "trigger disappeared after validation");
    const indent = calloutIndent(trigger.paragraph);
    const rendered = `\n\n${response.callout.split("\n").concat(`> <!-- mindos:distill:${response.trigger_id} -->`).map((line) => `${indent}${line}`).join("\n")}`;
    return { offset: findParagraphEnd(content, trigger), order: order.get(response.trigger_id) ?? 0, rendered };
  });
  let updated = content;
  for (const insertion of insertions.sort((left, right) => right.offset - left.offset || right.order - left.order)) {
    updated = updated.slice(0, insertion.offset) + insertion.rendered + updated.slice(insertion.offset);
  }
  await atomicWrite(root, source, updated, { expectedHash: contentHash(Buffer.from(content, "utf8")) });
  return { changed: true, data, artifacts: [{ kind: "journal", path: source }] };
}

export async function commitDistill(root: string, source: string, input: DistillResponseInput, apply: boolean): Promise<DistillCommitOutcome> {
  if (!apply) return evaluate(root, source, input, false);
  const lock = await acquireVaultLock(root, `.mindos/locks/distill-${contentHash(Buffer.from(source, "utf8")).slice(0, 24)}.lock`);
  try {
    return await evaluate(root, source, input, true);
  } finally {
    await lock.release();
  }
}
