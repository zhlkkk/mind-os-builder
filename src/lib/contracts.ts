import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv, type ValidateFunction } from "ajv";
import { assetPath } from "./assets.js";
import { MindosError } from "./paths.js";

const files = {
  collectionDecisions: "collection-decisions.schema.json",
  distillResponses: "distill-responses.schema.json",
  radarDecisions: "radar-decisions.schema.json",
} as const;

export type ContractName = keyof typeof files;

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

export function parseContract<T>(name: ContractName, value: unknown, message: string): T {
  if (!validator(name)(value)) throw new MindosError("mindos.input.invalid", message);
  return value as T;
}
