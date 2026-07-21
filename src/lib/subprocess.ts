import { spawn } from "node:child_process";
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

export async function runSubprocess(options: SubprocessOptions): Promise<CompletedSubprocess> {
  if (options.command.length === 0 || options.command.includes("\u0000") || (options.args ?? []).some((argument) => argument.includes("\u0000"))) {
    throw new MindosError("mindos.input.invalid", "subprocess command must be a non-empty argv value");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
  const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;

  return new Promise<CompletedSubprocess>((resolveResult, rejectResult) => {
    let failure: MindosError | undefined;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutSize = 0;
    let stderrSize = 0;
    const child = spawn(options.command, options.args ?? [], { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      failure ??= new MindosError("mindos.provider.timeout", "provider command timed out");
      child.kill();
    }, timeoutMs);

    const overLimit = (stream: "stdout" | "stderr"): void => {
      failure ??= new MindosError("mindos.provider.output_too_large", `${stream} exceeded output limit`);
      child.kill();
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutSize += chunk.length;
      if (stdoutSize > maxStdoutBytes) {
        overLimit("stdout");
      } else {
        stdout.push(chunk);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrSize += chunk.length;
      if (stderrSize > maxStderrBytes) {
        overLimit("stderr");
      } else {
        stderr.push(chunk);
      }
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      failure ??= new MindosError(
        error.code === "ENOENT" ? "mindos.dependency.unavailable" : "mindos.provider.command_failed",
        error.code === "ENOENT" ? "provider command is not installed" : "provider command could not start",
      );
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (failure !== undefined) {
        rejectResult(failure);
        return;
      }
      const renderedStderr = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        rejectResult(new MindosError("mindos.provider.command_failed", `provider command failed (${code ?? signal ?? "unknown"})`));
        return;
      }
      resolveResult({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: renderedStderr, exitCode: code ?? 0 });
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
