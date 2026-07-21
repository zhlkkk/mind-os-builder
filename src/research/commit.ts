import { readFile } from "node:fs/promises";
import { acquireVaultLock } from "../lib/lock.js";
import { MindosError, resolveWritePath } from "../lib/paths.js";
import { atomicWrite, contentHash } from "../lib/write.js";
import { appliedResult, blockedFromError, noopResult, previewResult, type CliResult } from "../lib/result.js";
import { readResearchCandidate, validateResearchTarget } from "./validate.js";

async function existing(root: string, target: string): Promise<string | undefined> {
  const path = await resolveWritePath(root, target, { capability: "research" });
  try { return await readFile(path, "utf8"); } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new MindosError("mindos.filesystem.read_failed", "cannot read research target");
  }
}

export async function commitResearch(root: string, candidatePath: string, targetValue: string, apply: boolean): Promise<CliResult> {
  try {
    const target = validateResearchTarget(targetValue);
    const candidate = await readResearchCandidate(root, candidatePath); const current = await existing(root, target);
    const data = { target, topic: candidate.metadata.topic, mode: candidate.metadata.mode, evidence_status: candidate.metadata.evidence_status,
      source_count: candidate.metadata.sources.length, tool_count: candidate.metadata.tools.length };
    if (current === candidate.content) return noopResult(data);
    if (current !== undefined) throw new MindosError("mindos.state.conflict", "research target already exists with different content");
    const artifacts = [{ kind: "research_report", path: target }];
    if (!apply) return previewResult(data, artifacts);
    const lockKey = contentHash(Buffer.from(target, "utf8")).slice(0, 16); const lock = await acquireVaultLock(root, `.mindos/locks/research-${lockKey}.lock`);
    try {
      const afterLock = await existing(root, target);
      if (afterLock === candidate.content) return noopResult(data);
      if (afterLock !== undefined) throw new MindosError("mindos.state.conflict", "research target already exists with different content");
      await atomicWrite(root, target, candidate.content, { capability: "research", expectedHash: null });
      return appliedResult(data, artifacts);
    } finally { await lock.release(); }
  } catch (error: unknown) { return blockedFromError(error, { target: targetValue }); }
}
