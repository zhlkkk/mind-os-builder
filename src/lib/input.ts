import { readFile, stat } from "node:fs/promises";
import { MindosError } from "./paths.js";

const DEFAULT_MAX_BYTES = 1024 * 1024;
const DEFAULT_MAX_DEPTH = 32;

export type JsonInputOptions = {
  maxBytes?: number;
  maxDepth?: number;
};

function validateDepth(value: unknown, depth: number, maxDepth: number): void {
  if (depth > maxDepth) {
    throw new MindosError("mindos.input.invalid", "JSON input exceeds maximum nesting depth");
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      validateDepth(item, depth + 1, maxDepth);
    }
  } else if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) {
      validateDepth(item, depth + 1, maxDepth);
    }
  }
}

export function parseJsonInput(source: string, options: JsonInputOptions = {}): unknown {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (Buffer.byteLength(source, "utf8") > maxBytes) {
    throw new MindosError("mindos.input.invalid", "JSON input exceeds maximum size");
  }
  try {
    const parsed: unknown = JSON.parse(source);
    validateDepth(parsed, 0, options.maxDepth ?? DEFAULT_MAX_DEPTH);
    return parsed;
  } catch (error: unknown) {
    if (error instanceof MindosError) {
      throw error;
    }
    throw new MindosError("mindos.input.invalid", "input is not valid JSON");
  }
}

export async function readJsonInput(path: string, options: JsonInputOptions = {}): Promise<unknown> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const metadata = await stat(path).catch(() => {
    throw new MindosError("mindos.input.invalid", "cannot read JSON input");
  });
  if (metadata.size > maxBytes) {
    throw new MindosError("mindos.input.invalid", "JSON input exceeds maximum size");
  }
  const source = await readFile(path, "utf8").catch(() => {
    throw new MindosError("mindos.input.invalid", "cannot read JSON input");
  });
  return parseJsonInput(source, options);
}

export function validateMarkdown(markdown: string, maxBytes = 256 * 1024): string {
  const hasUnsafeControlCharacter = [...markdown].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
  });
  if (Buffer.byteLength(markdown, "utf8") > maxBytes || hasUnsafeControlCharacter) {
    throw new MindosError("mindos.input.invalid", "Markdown input is unsafe or too large");
  }
  return markdown;
}

export function validateHttpUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MindosError("mindos.input.invalid", "invalid HTTP URL");
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username.length > 0 || url.password.length > 0 || url.hostname.length === 0) {
    throw new MindosError("mindos.input.invalid", "URL must be credential-free HTTP(S)");
  }
  return url;
}
