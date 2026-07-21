import { execFile, type ExecFileException } from "node:child_process";
import { parseJsonInput } from "./input.js";
import { MindosError } from "./paths.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_STDOUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;

export type SubprocessOptions = {
  command: string;
  args?: readonly string[];
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
};

export type CompletedSubprocess = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

function providerError(error: ExecFileException): MindosError {
  if (error.code === "ENOENT") {
    return new MindosError("mindos.dependency.unavailable", "provider command is not installed");
  }
  if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    return new MindosError("mindos.provider.output_too_large", "provider output exceeded limit");
  }
  if (error.killed) {
    return new MindosError("mindos.provider.timeout", "provider command timed out");
  }
  return new MindosError("mindos.provider.command_failed", `provider command failed (${error.code ?? error.signal ?? "unknown"})`);
}

export async function runSubprocess(options: SubprocessOptions): Promise<CompletedSubprocess> {
  if (options.command.length === 0 || options.command.includes("\u0000") || (options.args ?? []).some((argument) => argument.includes("\u0000"))) {
    throw new MindosError("mindos.input.invalid", "subprocess command must be a non-empty argv value");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;

  return new Promise<CompletedSubprocess>((resolveResult, rejectResult) => {
    execFile(options.command, [...(options.args ?? [])], {
      encoding: "utf8",
      maxBuffer: Math.max(maxStdoutBytes, maxStderrBytes),
      shell: false,
      timeout: timeoutMs,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error !== null) {
        rejectResult(providerError(error));
        return;
      }
      if (Buffer.byteLength(stdout, "utf8") > maxStdoutBytes || Buffer.byteLength(stderr, "utf8") > maxStderrBytes) {
        rejectResult(new MindosError("mindos.provider.output_too_large", "provider output exceeded limit"));
        return;
      }
      resolveResult({ stdout, stderr, exitCode: 0 });
    });
  });
}

export async function runJsonSubprocess(options: SubprocessOptions): Promise<unknown> {
  const completed = await runSubprocess(options);
  try {
    return parseJsonInput(completed.stdout, {
      maxBytes: options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES,
    });
  } catch {
    throw new MindosError("mindos.provider.invalid_output", "provider returned invalid JSON");
  }
}
