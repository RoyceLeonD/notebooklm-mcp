import type { Page } from "patchright";
import { Selectors, joinAlt } from "./selectors.js";
import { safeSleep } from "../browser/watchdog.js";

export interface CreateNotebookResult {
  url: string;
  id?: string;
  title: string;
}

/** Create a notebook through the visible NotebookLM UI; no private API is used. */
export async function createNotebook(page: Page, title: string): Promise<CreateNotebookResult> {
  const button = page.locator(joinAlt(Selectors.notebooks.createButton)).first();
  if (!(await button.isVisible({ timeout: 5_000 }).catch(() => false))) {
    throw new Error("NotebookLM create-notebook control was not found; the UI may have changed");
  }
  await button.click();
  const input = page.locator(joinAlt(Selectors.notebooks.titleInput)).first();
  if (await input.isVisible({ timeout: 3_000 }).catch(() => false)) await input.fill(title);
  const confirm = page.locator(joinAlt(Selectors.notebooks.createConfirm)).first();
  if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click();
  await page.waitForURL(/\/notebook\//, { timeout: 30_000 });
  await safeSleep(page, 500);
  const url = page.url();
  const id = url.match(/\/notebook\/([^/?#]+)/)?.[1];
  return { url, id, title };
}
