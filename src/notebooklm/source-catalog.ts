import { Selectors } from "./selectors.js";
import type { SourceFailureClass } from "./sources.js";

export interface SourceMetadata {
  index: number;
  title: string;
  url?: string;
  text?: string;
}

export interface SourceMutationResult {
  success: boolean;
  failureClass?: SourceFailureClass | "unsupported";
  retryable: boolean;
  message?: string;
  nextSteps: string[];
  attempts?: number;
}

/** Read source titles/URLs from the live DOM without treating a count as metadata. */
export async function listSources(page: {
  locator(selector: string): {
    count(): Promise<number>;
    nth(index: number): {
      textContent(): Promise<string | null>;
      getAttribute(name: string): Promise<string | null>;
    };
  };
}): Promise<SourceMetadata[]> {
  const rows = page.locator(Selectors.sources.sourceContainer);
  const count = await rows.count();
  const sources: SourceMetadata[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const title = (await row.textContent())?.trim() || `Source ${index + 1}`;
    const url =
      (await row.getAttribute("data-source-url")) ?? (await row.getAttribute("href")) ?? undefined;
    sources.push({ index, title, ...(url ? { url } : {}) });
  }
  return sources;
}

export function unsupportedSourceMutation(operation: "update" | "remove"): SourceMutationResult {
  return {
    success: false,
    failureClass: "unsupported",
    retryable: false,
    message: `NotebookLM source ${operation} is not verified by the current UI integration.`,
    nextSteps: [
      "Use the NotebookLM UI to update or remove the source, then call list_sources to verify the inventory.",
      "Do not retry automatically: no stable mutation selector is available.",
    ],
  };
}

export async function retrySourceOperation<T>(
  operation: () => Promise<T>,
  maxAttempts = 2
): Promise<
  | { success: true; value: T; attempts: number }
  | { success: false; error: string; attempts: number; retryable: boolean; nextSteps: string[] }
> {
  let lastError = "source operation failed";
  for (let attempts = 1; attempts <= Math.max(1, maxAttempts); attempts += 1) {
    try {
      return { success: true, value: await operation(), attempts };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  return {
    success: false,
    error: lastError,
    attempts: Math.max(1, maxAttempts),
    retryable: /timeout|network|crawl|not ready/i.test(lastError),
    nextSteps: ["Verify the notebook page is loaded and retry the source operation once."],
  };
}
