import { spawn } from "node:child_process";
import { previewResult, type CliResult } from "../lib/result.js";

async function isAvailable(command: string): Promise<boolean> {
  return new Promise<boolean>((resolveAvailable) => {
    const child = spawn(command, ["--version"], { shell: false, stdio: "ignore" });
    let settled = false;
    const finish = (available: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveAvailable(available);
    };
    const timer = setTimeout(() => {
      finish(false);
      child.kill();
    }, 1_000);
    child.once("error", () => finish(false));
    child.once("close", (code, signal) => finish(code === 0 && signal === null));
  });
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
