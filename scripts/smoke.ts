import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runOfflineJourney } from "../examples/offline-full-journey.js";

const root = await mkdtemp(join(tmpdir(), "mindos-smoke-"));
try {
  const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url)); const result = await runOfflineJourney(cli, join(root, "vault"), root);
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally { await rm(root, { recursive: true, force: true }); }
