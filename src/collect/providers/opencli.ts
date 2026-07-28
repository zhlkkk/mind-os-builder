import { runJsonSubprocess } from "../../lib/subprocess.js";
import { normalizeProvider } from "../model.js";

export async function fetchTwitter(cursor: string | null): Promise<ReturnType<typeof normalizeProvider>> {
  void cursor;
  const signals = new Map<string, ReturnType<typeof normalizeProvider>["signals"][number]>();
  for (const type of ["for-you", "following"]) {
    const normalized = normalizeProvider("twitter", await runJsonSubprocess({
      command: "opencli", args: ["twitter", "timeline", "--type", type, "--limit", "50", "--window", "background", "-f", "json"],
    }));
    for (const signal of normalized.signals) signals.set(signal.id, signals.get(signal.id) ?? signal);
  }
  return { signals: [...signals.values()], cursor: null };
}
