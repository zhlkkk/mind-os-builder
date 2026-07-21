import { MindosError } from "../lib/paths.js";
import type { RadarBatch } from "./prepare.js";

export type RadarDecision = { suggestion_id: string; decision: "approve" | "reject" };
export type RadarDecisionInput = { version: "v1"; batch_id: string; baseline_hash: string; decisions: RadarDecision[] };

function invalid(message: string): never { throw new MindosError("mindos.input.invalid", message); }

export function parseRadarDecisions(value: unknown): RadarDecisionInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid("radar decision envelope must be an object");
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== "v1" || typeof envelope.batch_id !== "string" || !/^[a-f0-9]{32}$/u.test(envelope.batch_id)
    || typeof envelope.baseline_hash !== "string" || !/^[a-f0-9]{64}$/u.test(envelope.baseline_hash)
    || !Array.isArray(envelope.decisions) || envelope.decisions.length > 500
    || Object.keys(envelope).some((key) => !["version", "batch_id", "baseline_hash", "decisions"].includes(key))) invalid("radar decision envelope is invalid");
  const decisions = envelope.decisions.map((raw): RadarDecision => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) invalid("radar decision is invalid");
    const item = raw as Record<string, unknown>;
    if (typeof item.suggestion_id !== "string" || !/^radar:v1:[a-f0-9]{20}$/u.test(item.suggestion_id)
      || (item.decision !== "approve" && item.decision !== "reject")
      || Object.keys(item).some((key) => !["suggestion_id", "decision"].includes(key))) invalid("radar decision is invalid");
    return { suggestion_id: item.suggestion_id, decision: item.decision };
  });
  if (new Set(decisions.map((item) => item.suggestion_id)).size !== decisions.length) invalid("radar decisions contain duplicate suggestion ids");
  return { version: "v1", batch_id: envelope.batch_id, baseline_hash: envelope.baseline_hash, decisions };
}

export function validateRadarDecisionCoverage(batch: RadarBatch, input: RadarDecisionInput): Map<string, RadarDecision> {
  if (input.baseline_hash !== batch.baseline_hash || input.decisions.length !== batch.suggestions.length) invalid("decisions do not match the radar batch");
  const expected = new Set(batch.suggestions.map((item) => item.suggestion_id)); const decisions = new Map<string, RadarDecision>();
  for (const decision of input.decisions) {
    if (!expected.has(decision.suggestion_id)) invalid("radar decision contains an unknown suggestion id");
    decisions.set(decision.suggestion_id, decision);
  }
  return decisions;
}
