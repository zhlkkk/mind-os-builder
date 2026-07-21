import { validateMarkdown } from "../lib/input.js";
import { MindosError } from "../lib/paths.js";
import { PERSONAS, type DistillTrigger, type Persona } from "./scan.js";

export type DistillResponse = { trigger_id: string; persona: Persona; callout: string };
export type DistillResponseInput = { version: "v1"; baseline_hash: string; responses: DistillResponse[] };

const HEADERS: Record<Persona, RegExp> = {
  lumina: /^> \[!quote\] 🌿 Lumina \(\d{2}:\d{2}\)$/u,
  prism: /^> \[!quote\] 🌌 Prism \(\d{2}:\d{2}\)$/u,
  vector: /^> \[!quote\] 🔨 Vector \(\d{2}:\d{2}\)$/u,
  nexus: /^> \[!info\] 🌐 Nexus \(\d{2}:\d{2}\)$/u,
  ember: /^> \[!quote\] 🔥 Ember \(\d{2}:\d{2}\)$/u,
};

function invalid(message: string): never {
  throw new MindosError("mindos.input.invalid", message);
}

export function parseDistillResponses(value: unknown): DistillResponseInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid("response envelope must be an object");
  const envelope = value as Record<string, unknown>;
  if (envelope.version !== "v1" || typeof envelope.baseline_hash !== "string" || !/^[a-f0-9]{64}$/u.test(envelope.baseline_hash)
    || !Array.isArray(envelope.responses) || envelope.responses.length > 500
    || Object.keys(envelope).some((key) => !["version", "baseline_hash", "responses"].includes(key))) {
    invalid("response envelope is invalid");
  }
  const responses: DistillResponse[] = envelope.responses.map((raw): DistillResponse => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) invalid("distill response is invalid");
    const item = raw as Record<string, unknown>;
    if (typeof item.trigger_id !== "string" || !/^distill:v1:[a-f0-9]{20}$/u.test(item.trigger_id)
      || typeof item.persona !== "string" || !PERSONAS.includes(item.persona as Persona)
      || typeof item.callout !== "string" || Object.keys(item).some((key) => !["trigger_id", "persona", "callout"].includes(key))) {
      invalid("distill response is invalid");
    }
    const persona = item.persona as Persona;
    const callout = validateMarkdown(item.callout, 20_000).trim();
    const lines = callout.split("\n");
    if (lines.length < 2 || !HEADERS[persona].test(lines[0] ?? "") || lines.some((line) => !line.startsWith(">"))
      || callout.includes("mindos:distill:")) {
      invalid("distill Callout is invalid");
    }
    return { trigger_id: item.trigger_id, persona, callout };
  });
  if (new Set(responses.map((item) => item.trigger_id)).size !== responses.length) invalid("distill responses contain duplicate trigger ids");
  return { version: "v1", baseline_hash: envelope.baseline_hash, responses };
}

export function validateResponseCoverage(triggers: readonly DistillTrigger[], input: DistillResponseInput): DistillResponse[] {
  const expected = new Map(triggers.map((trigger) => [trigger.trigger_id, trigger]));
  if (input.responses.length !== expected.size) invalid("responses must cover every scanned trigger");
  for (const response of input.responses) {
    const trigger = expected.get(response.trigger_id);
    if (trigger === undefined) invalid("response contains an unknown trigger id");
    if (trigger.persona !== response.persona) invalid("response persona does not match its trigger");
  }
  const byId = new Map(input.responses.map((response) => [response.trigger_id, response]));
  return triggers.map((trigger) => byId.get(trigger.trigger_id) as DistillResponse);
}
