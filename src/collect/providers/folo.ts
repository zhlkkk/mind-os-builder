import { MindosError } from "../../lib/paths.js";
import { runJsonSubprocess, runSubprocess } from "../../lib/subprocess.js";
import { normalizeProvider } from "../model.js";

const PAGE_SIZE = 50; const MAX_PAGES = 10; const MAX_SIGNALS = PAGE_SIZE * MAX_PAGES;
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null ? value as Record<string, unknown> : {};

export async function fetchRss(cursor: string | null): Promise<ReturnType<typeof normalizeProvider>> {
  void cursor; const signals = new Map<string, ReturnType<typeof normalizeProvider>["signals"][number]>(); const visitedCursors = new Set<string>(); let pageCursor: string | null = null;
  for (let page = 0; page < MAX_PAGES && signals.size < MAX_SIGNALS; page += 1) {
    const args = ["timeline", "--view", "articles", "--limit", String(PAGE_SIZE), "--unread-only", ...(pageCursor === null ? [] : ["--cursor", pageCursor]), "-f", "json"];
    const data = object(object(await runJsonSubprocess({ command: "folo", args })).data);
    const entries = Array.isArray(data.entries) ? data.entries.map((item) => {
      const wrapper = object(item); const entry = object(wrapper.entries); const feed = object(wrapper.feeds);
      return { ...entry, title: entry.title || entry.summary || entry.description || feed.title || entry.url, author: feed.title ?? entry.author };
    }) : undefined;
    for (const signal of normalizeProvider("rss", { entries }).signals) { signals.set(signal.id, signals.get(signal.id) ?? signal); if (signals.size === MAX_SIGNALS) break; }
    if (data.hasNext !== true) break;
    const nextCursor = typeof data.nextCursor === "string" && data.nextCursor.length <= 4_096 ? data.nextCursor : null;
    if (nextCursor === null || visitedCursors.has(nextCursor)) throw new MindosError("mindos.provider.invalid_output", "Folo pagination cursor is invalid");
    visitedCursors.add(nextCursor); pageCursor = nextCursor;
  }
  return { signals: [...signals.values()], cursor: null };
}

export async function markRssRead(ids: readonly string[]): Promise<void> { for (const id of ids) await runSubprocess({ command: "folo", args: ["entry", "mark-read", id] }); }
