import { spawn } from "node:child_process";
import { previewResult, type CliResult } from "../lib/result.js";

async function isAvailable(command: string): Promise<boolean> {
  return new Promise<boolean>((resolveAvailable) => {
    const child = spawn(command, ["--version"], { shell: false, stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      resolveAvailable(true);
    }, 1_000);
    child.once("error", () => {
      clearTimeout(timer);
      resolveAvailable(false);
    });
    child.once("close", () => {
      clearTimeout(timer);
      resolveAvailable(true);
    });
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
