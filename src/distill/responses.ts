import { parseContract } from "../lib/contracts.js";
import { validateMarkdown } from "../lib/input.js";
import { MindosError } from "../lib/paths.js";
import { type DistillTrigger, type Persona } from "./scan.js";

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
  const envelope = parseContract<DistillResponseInput>("distillResponses", value, "response envelope is invalid");
  const responses: DistillResponse[] = envelope.responses.map((item): DistillResponse => {
    const persona = item.persona;
    const callout = validateMarkdown(item.callout, 20_000).trim();
    const lines = callout.split("\n");
    if (lines.length < 2 || !HEADERS[persona].test(lines[0] ?? "") || lines.some((line) => !line.startsWith(">"))
      || callout.includes("mindos:distill:")) {
      invalid("distill Callout is invalid");
    }
    return { trigger_id: item.trigger_id, persona, callout };
  });
  if (new Set(responses.map((item) => item.trigger_id)).size !== responses.length) invalid("distill responses contain duplicate trigger ids");
  return { ...envelope, responses };
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
