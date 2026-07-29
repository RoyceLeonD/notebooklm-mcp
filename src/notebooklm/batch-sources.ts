import fs from "fs/promises";
import path from "path";
import type { BrowserSession } from "../session/browser-session.js";
import { classifySourceFailure, type AddSourceResult, type SourceFailureClass } from "./sources.js";

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
  failureClass?: SourceFailureClass;
  retryable?: boolean;
  nextSteps?: string[];
}

export interface UnresolvedSourceActionItem {
  index: number;
  url: string;
  failureClass: SourceFailureClass;
  retryable: boolean;
  nextSteps: string[];
}

/** Ingest local Markdown, URLs, and text sequentially so each result is attributable. */
export async function addSources(
  session: BrowserSession,
  sources: BatchSource[]
): Promise<{
  requested: number;
  succeeded: number;
  results: BatchSourceResult[];
  actionItems: UnresolvedSourceActionItem[];
}> {
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
      const message = error instanceof Error ? error.message : String(error);
      const diagnostic = classifySourceFailure(message, source.type === "url" ? "url" : "text");
      results.push({
        index,
        source,
        error: message,
        ...diagnostic,
      });
    }
  }
  return {
    requested: sources.length,
    succeeded: results.filter((r) => r.result?.success).length,
    results,
    actionItems: buildSourceActionItems(results),
  };
}

/** Return structured remediation records for failed URL imports. */
export function buildSourceActionItems(results: BatchSourceResult[]): UnresolvedSourceActionItem[] {
  return results.flatMap((entry) => {
    const url = entry.source.type === "url" ? entry.source.url?.trim() : undefined;
    if (!url || entry.result?.success) return [];
    const diagnostic = entry.result
      ? {
          failureClass: entry.result.failureClass ?? "unknown",
          retryable: entry.result.retryable,
          nextSteps: entry.result.nextSteps,
        }
      : {
          ...classifySourceFailure(entry.error ?? "source import failed", "url"),
        };
    return [{ index: entry.index, url, ...diagnostic }];
  });
}
