import fs from "fs/promises";
import path from "path";
import type { BrowserSession } from "../session/browser-session.js";
import type { AddSourceResult } from "./sources.js";

export interface BatchSource {
  type: "markdown" | "url" | "text";
  path?: string;
  url?: string;
  text?: string;
  title?: string;
}
export interface BatchSourceResult {
  index: number;
  source: BatchSource;
  result?: AddSourceResult;
  error?: string;
}

/** Ingest local Markdown, URLs, and text sequentially so each result is attributable. */
export async function addSources(
  session: BrowserSession,
  sources: BatchSource[]
): Promise<{ requested: number; succeeded: number; results: BatchSourceResult[] }> {
  const results: BatchSourceResult[] = [];
  for (const [index, source] of sources.entries()) {
    try {
      let type: "url" | "text";
      let content: string;
      if (source.type === "url") {
        type = "url";
        content = source.url ?? "";
      } else if (source.type === "text") {
        type = "text";
        content = source.text ?? "";
      } else {
        type = "text";
        content = await fs.readFile(path.resolve(source.path ?? ""), "utf8");
      }
      if (!content.trim()) throw new Error("source content is empty");
      const result = await session.addSource({
        type,
        content,
        title: source.title ?? (source.path ? path.basename(source.path) : undefined),
      });
      results.push({ index, source, result });
    } catch (error) {
      results.push({
        index,
        source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    requested: sources.length,
    succeeded: results.filter((r) => r.result?.success).length,
    results,
  };
}
