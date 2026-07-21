import { MindosError } from "./paths.js";

export type CliState = "preview" | "applied" | "noop" | "needs_agent" | "blocked" | "failed";

export type CliResult = {
  version: "v1";
  ok: boolean;
  state: CliState;
  changed: boolean;
  artifacts: Array<{ kind: string; path: string }>;
  data: Record<string, unknown>;
  error?: { code: string; message: string };
};

export function previewResult(data: Record<string, unknown>): CliResult {
  return { version: "v1", ok: true, state: "preview", changed: false, artifacts: [], data };
}

export function appliedResult(data: Record<string, unknown>, artifacts: CliResult["artifacts"]): CliResult {
  return { version: "v1", ok: true, state: "applied", changed: true, artifacts, data };
}

export function noopResult(data: Record<string, unknown>): CliResult {
  return { version: "v1", ok: true, state: "noop", changed: false, artifacts: [], data };
}

export function blockedResult(code: string, message: string, data: Record<string, unknown>): CliResult {
  return { version: "v1", ok: false, state: "blocked", changed: false, artifacts: [], data, error: { code, message } };
}

export function failedResult(error: unknown): CliResult {
  const safe = error instanceof MindosError
    ? error
    : new MindosError("mindos.filesystem.failed", "unexpected command failure");
  return {
    version: "v1",
    ok: false,
    state: "failed",
    changed: false,
    artifacts: [],
    data: {},
    error: { code: safe.code, message: safe.message },
  };
}
