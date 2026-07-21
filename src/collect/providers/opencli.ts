import { runJsonSubprocess } from "../../lib/subprocess.js";
import { normalizeProvider } from "../model.js";

export async function fetchTwitter(cursor: string | null): Promise<ReturnType<typeof normalizeProvider>> {
  const args = ["twitter", "timeline", "-f", "json", ...(cursor === null ? [] : ["--cursor", cursor])];
  return normalizeProvider("twitter", await runJsonSubprocess({ command: "opencli", args }));
}
