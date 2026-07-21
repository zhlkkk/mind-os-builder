import { runJsonSubprocess } from "../../lib/subprocess.js";
import { normalizeProvider } from "../model.js";

export async function fetchRss(cursor: string | null): Promise<ReturnType<typeof normalizeProvider>> {
  const args = ["entries", "--json", ...(cursor === null ? [] : ["--cursor", cursor])];
  return normalizeProvider("rss", await runJsonSubprocess({ command: "folocli", args }));
}
