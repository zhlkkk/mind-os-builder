import { parse } from "yaml";

export type FrontmatterFailure = "invalid" | "missing" | "too_large" | "unclosed";
export type FrontmatterResult =
  | { ok: true; metadata: unknown; body: string }
  | { ok: false; reason: FrontmatterFailure };

type FrontmatterOptions = {
  maxAliasCount?: number;
  maxLength?: number;
};

export function parseFrontmatter(content: string, options: FrontmatterOptions = {}): FrontmatterResult {
  if (!content.startsWith("---\n")) {
    return { ok: false, reason: "missing" };
  }
  const boundary = content.indexOf("\n---\n", 4);
  if (boundary < 0) {
    return { ok: false, reason: "unclosed" };
  }
  if (options.maxLength !== undefined && boundary > options.maxLength) {
    return { ok: false, reason: "too_large" };
  }
  try {
    const metadata: unknown = options.maxAliasCount === undefined
      ? parse(content.slice(4, boundary))
      : parse(content.slice(4, boundary), { maxAliasCount: options.maxAliasCount });
    return { ok: true, metadata, body: content.slice(boundary + 5) };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
