import { runJsonSubprocess } from "../../lib/subprocess.js";
import { normalizeProvider } from "../model.js";

export async function fetchRss(cursor: string | null): Promise<ReturnType<typeof normalizeProvider>> {
  void cursor;
  const args = ["timeline", "--view", "articles", "--limit", "50", "-f", "json"];
  const result = await runJsonSubprocess({ command: "folo", args });
  const response = typeof result === "object" && result !== null ? result as Record<string, unknown> : {};
  const data = typeof response.data === "object" && response.data !== null ? response.data as Record<string, unknown> : {};
  const entries = Array.isArray(data.entries) ? data.entries.map((item) => {
    const wrapper = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
    const entry = typeof wrapper.entries === "object" && wrapper.entries !== null ? wrapper.entries as Record<string, unknown> : {};
    const feed = typeof wrapper.feeds === "object" && wrapper.feeds !== null ? wrapper.feeds as Record<string, unknown> : {};
    return { ...entry, author: feed.title ?? entry.author };
  }) : undefined;
  return normalizeProvider("rss", { entries, cursor: null });
}
