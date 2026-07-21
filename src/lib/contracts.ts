import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv, type ValidateFunction } from "ajv";
import type { DecisionInput } from "../collect/commit.js";
import type { DistillResponseInput } from "../distill/responses.js";
import type { RadarDecisionInput } from "../radar/decisions.js";
import { assetPath } from "./assets.js";
import { MindosError } from "./paths.js";

const files = {
  collectionDecisions: "collection-decisions.schema.json",
  distillResponses: "distill-responses.schema.json",
  radarDecisions: "radar-decisions.schema.json",
} as const;

export type ContractName = keyof typeof files;
type ContractTypes = {
  collectionDecisions: DecisionInput;
  distillResponses: DistillResponseInput;
  radarDecisions: RadarDecisionInput;
};

const ajv = new Ajv({ allErrors: true });
const validators = new Map<ContractName, ValidateFunction>();

function validator(name: ContractName): ValidateFunction {
  const cached = validators.get(name);
  if (cached !== undefined) return cached;
  const schema = JSON.parse(readFileSync(join(assetPath("contracts"), files[name]), "utf8")) as object;
  const compiled = ajv.compile(schema);
  validators.set(name, compiled);
  return compiled;
}

export function parseContract<N extends ContractName>(name: N, value: unknown, message: string): ContractTypes[N] {
  if (!validator(name)(value)) throw new MindosError("mindos.input.invalid", message);
  return value as ContractTypes[N];
}
