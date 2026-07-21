import { runSubprocess } from "../lib/subprocess.js";
import { previewResult, type CliResult } from "../lib/result.js";

async function isAvailable(command: string): Promise<boolean> {
  try {
    await runSubprocess({ command, args: ["--version"], timeoutMs: 1_000, maxStdoutBytes: 64 * 1024, maxStderrBytes: 64 * 1024 });
    return true;
  } catch {
    return false;
  }
}

export async function doctor(): Promise<CliResult> {
  const [opencli, folocli, obsidian] = await Promise.all([isAvailable("opencli"), isAvailable("folocli"), isAvailable("obsidian")]);
  return previewResult({
    node: { version: process.version, supported: process.versions.node.startsWith("24.") },
    platform: { name: process.platform, certified: process.platform === "darwin" },
    dependencies: {
      opencli: { available: opencli },
      folocli: { available: folocli },
      obsidian: { available: obsidian },
    },
  });
}
