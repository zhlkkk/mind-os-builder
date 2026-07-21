import { parseContract } from "../lib/contracts.js";
import { MindosError } from "../lib/paths.js";
import type { RadarBatch } from "./prepare.js";

export type RadarDecision = { suggestion_id: string; decision: "approve" | "reject" };
export type RadarDecisionInput = { version: "v1"; batch_id: string; baseline_hash: string; decisions: RadarDecision[] };

function invalid(message: string): never { throw new MindosError("mindos.input.invalid", message); }

export function parseRadarDecisions(value: unknown): RadarDecisionInput {
  const envelope = parseContract<RadarDecisionInput>("radarDecisions", value, "radar decision envelope is invalid");
  const decisions = envelope.decisions;
  if (new Set(decisions.map((item) => item.suggestion_id)).size !== decisions.length) invalid("radar decisions contain duplicate suggestion ids");
  return envelope;
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
