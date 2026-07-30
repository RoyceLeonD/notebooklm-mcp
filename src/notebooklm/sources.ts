/**
 * NotebookLM source ingestion (issue #25).
 *
 * v2.0.0 supports URL, text, and local PDF/PPT/PPTX file sources.
 * YouTube and Google-Drive ingestion remain out of scope because they use
 * different overlay flows.
 *
 * Robustness strategy (2026-05, ported from the Fork's content-manager.ts):
 *
 *   1. Capture the *expected notebook UUID* from the URL up-front. NotebookLM
 *      sometimes redirects pasted-text uploads to a freshly-created notebook;
 *      we detect that and surface a clear error.
 *
 *   2. Resolve the dialog state defensively: if a dialog is already open we
 *      use it; otherwise we click the sidebar "Add source" button. The
 *      `[role="dialog"]` anchor is set synchronously on mount, so we do not
 *      have to race the Material `.mdc-dialog--open` animation class.
 *
 *   3. Source-type buttons no longer ship with aria-labels — see
 *      selectors.ts for the icon-/text-based anchors.
 *
 *   4. Insert verification is COUNT-BASED: snapshot
 *      `.single-source-container` count before the submit click, then poll
 *      after the dialog closes (up to 90 s — URL crawls are slow).
 */

import type { Page } from "patchright";
import { Selectors, joinAlt } from "./selectors.js";
import { safeSleep, isRecoverable } from "../browser/watchdog.js";
import { log } from "../utils/logger.js";

export type SourceType = "url" | "text" | "file";

export interface AddSourceInput {
  type: SourceType;
  /** URL when `type === "url"`, raw text when `type === "text"`. */
  content?: string;
  /** Absolute local PDF/PPT/PPTX path when `type === "file"`. */
  filePath?: string;
  /** Optional title shown in the source list. NotebookLM uses a default if omitted. */
  title?: string;
}

export interface AddSourceResult {
  success: boolean;
  type: SourceType;
  sourceCountBefore: number;
  sourceCountAfter: number;
  message?: string;
  failureClass?: SourceFailureClass;
  retryable: boolean;
  nextSteps: string[];
  attempts: number;
  sourceTitle?: string;
  sourceIdentityVerified?: boolean;
}

export type SourceFailureClass =
  | "ui_not_ready"
  | "source_unavailable"
  | "notebook_redirect"
  | "source_limit"
  | "validation"
  | "unknown";

export interface SourceFailureDiagnostic {
  failureClass: SourceFailureClass;
  retryable: boolean;
  nextSteps: string[];
}

export function classifySourceFailure(message: string, type: SourceType): SourceFailureDiagnostic {
  const lower = message.toLowerCase();
  if (
    /chat input|add.?source|source dialog|overlay|input field|native input|file.?upload|notebook page has loaded/.test(lower)
  ) {
    return {
      failureClass: "ui_not_ready",
      retryable: true,
      nextSteps: [
        "Retry once after the NotebookLM page/session is reinitialized.",
        "If it repeats, call add_source with show_browser=true and verify the notebook is loaded.",
      ],
    };
  }
  if (/redirected|different notebook|untitled notebook/.test(lower)) {
    return {
      failureClass: "notebook_redirect",
      retryable: false,
      nextSteps: [
        "Use the notebook URL shown in the error and retry the source against that notebook.",
      ],
    };
  }
  if (/50 sources|source limit|maximum.*source|too many sources/.test(lower)) {
    return {
      failureClass: "source_limit",
      retryable: false,
      nextSteps: ["Remove an existing source or choose a notebook with available source capacity."],
    };
  }
  if (/invalid|empty|fully-qualified|unsupported|url/.test(lower) && type === "url") {
    return {
      failureClass: "validation",
      retryable: false,
      nextSteps: [
        "Check that the URL is reachable, fully qualified, and points to importable content.",
      ],
    };
  }
  if (/crawl|fetch|unavailable|blocked|timeout|network/.test(lower)) {
    return {
      failureClass: "source_unavailable",
      retryable: true,
      nextSteps: ["Confirm the URL is reachable without authentication, then retry the import."],
    };
  }
  return {
    failureClass: "unknown",
    retryable: false,
    nextSteps: [
      "Inspect the returned message, verify the notebook is loaded, and retry once if appropriate.",
    ],
  };
}

function failedResult(
  type: SourceType,
  message: string,
  before = 0,
  attempts = 1
): AddSourceResult {
  return {
    success: false,
    type,
    sourceCountBefore: before,
    sourceCountAfter: before,
    message,
    ...classifySourceFailure(message, type),
    attempts,
  };
}

export async function addSource(page: Page, input: AddSourceInput): Promise<AddSourceResult> {
  const initialUrl = page.url();
  const expectedUuid = initialUrl.match(/notebook\/([a-f0-9-]+)/)?.[1];
  log.info(`📄 [add_source] type=${input.type} target_uuid=${expectedUuid ?? "?"}`);

  try {
    // 1. Open the Add-source dialog (or use one that's already open).
    await openAddSourceOverlay(page);

    // 2. File uploads use the native browser file chooser; URL/text use the
    //    picker and textarea flow.
    await pickSourceType(page, input.type);

    // 3. Fill the content + optional title, or upload the local file.
    if (input.type === "file") await uploadSourceFile(page, input);
    else await fillSourceContent(page, input);

    // 4. Snapshot the source count *before* submitting. The Fork captures it
    //    here (dialog still open, sidebar list not yet updated) so the
    //    post-close poll can detect a real increment.
    const before = await countSources(page);
    log.info(`  📊 source count before submit: ${before}`);

    // 5. Click the primary "Insert" / "Hinzufügen" button.
    await confirmInsert(page);

    // 6. Wait for the dialog to animate away. NotebookLM doesn't append the
    //    new sidebar entry until the modal is fully gone.
    await waitForOverlayToClose(page);

    // 7. UUID redirect check: pasted-text uploads occasionally land in a new
    //    "Untitled notebook" instead of the target. Catch that here so the
    //    caller sees a useful error instead of a phantom success.
    if (expectedUuid) {
      const currentUrl = page.url();
      const currentUuid = currentUrl.match(/notebook\/([a-f0-9-]+)/)?.[1];
      if (currentUuid && currentUuid !== expectedUuid) {
        log.error(`  ❌ Notebook redirect: expected ${expectedUuid}, got ${currentUuid}`);
        return {
          ...failedResult(
            input.type,
            `NotebookLM redirected to a different notebook (${currentUuid}) instead of ` +
              `the target (${expectedUuid}). This is a known quirk for pasted-text uploads — ` +
              `the source landed in a new "Untitled notebook".`,
            before
          ),
          failureClass: "notebook_redirect",
          retryable: false,
        };
      }
    }

    // 8. Poll the source count for up to 90 s; URL crawls and large pastes
    //    can take a while to materialise as a sidebar entry.
    const after = await waitForSourceCountIncrease(page, before, 90_000);

    if (after > before) {
      const sourceTitle = sourceTitleForInput(input);
      const sourceIdentityVerified = sourceTitle
        ? await verifySourceIdentity(page, sourceTitle)
        : true;
      if (!sourceIdentityVerified) {
        return {
          ...failedResult(input.type, `Source count increased, but expected source title "${sourceTitle}" was not found in the source list.`, before),
          sourceCountAfter: after,
          sourceTitle,
          sourceIdentityVerified: false,
        };
      }
      log.success(`  ✅ source added (count ${before} → ${after})`);
      return {
        success: true,
        type: input.type,
        sourceCountBefore: before,
        sourceCountAfter: after,
        retryable: false,
        nextSteps: [],
        attempts: 1,
        sourceTitle,
        sourceIdentityVerified,
      };
    }

    // 9. Last-ditch: maybe an error toast surfaced; surface it verbatim.
    const errorText = await readDialogError(page);
    return failedResult(
      input.type,
      errorText ||
        "Source dialog completed but the source list did not grow within 90 s. " +
          "Either NotebookLM is still crawling/indexing or the upload silently failed.",
      before
    );
  } catch (err) {
    if (isRecoverable(err)) throw err;
    log.warning(`  ⚠️  add_source failed: ${err}`);
    return failedResult(input.type, err instanceof Error ? err.message : String(err));
  }
}

const LOCAL_FILE_EXTENSIONS = new Set([".pdf", ".ppt", ".pptx"]);

export function sourceTitleForInput(input: AddSourceInput): string | undefined {
  if (input.type !== "file") return undefined;
  if (input.title?.trim()) return input.title.trim();
  if (input.filePath) return input.filePath.split(/[\\\\/]/).pop();
  return undefined;
}

export function validateFileInput(input: AddSourceInput): void {
  if (input.type !== "file") return;
  if (!input.filePath?.trim()) throw new Error("file source requires filePath");
  const extension = input.filePath.toLowerCase().match(/\.[^.\\\\/]+$/)?.[0];
  if (!extension || !LOCAL_FILE_EXTENSIONS.has(extension)) {
    throw new Error("file source must be a PDF, PPT, or PPTX file");
  }
}

async function uploadSourceFile(page: Page, input: AddSourceInput): Promise<void> {
  validateFileInput(input);
  const overlay = page.locator(Selectors.sources.overlayPane).first();
  const fileInput = overlay.locator('input[type="file"]').first();
  if (await fileInput.count().catch(() => 0)) {
    await fileInput.setInputFiles(input.filePath!);
    return;
  }
  // Do not automate an OS file picker. If the page does not expose the native
  // input, return an explicit incomplete result rather than guessing.
  throw new Error("NotebookLM did not expose a native input[type=file] control; safe file upload is incomplete for this UI variant");
}

async function verifySourceIdentity(page: Page, expectedTitle: string): Promise<boolean> {
  const rows = page.locator(Selectors.sources.sourceContainer);
  const expected = expectedTitle.trim().toLowerCase();
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const text = (await rows.nth(index).textContent().catch(() => null))?.trim().toLowerCase();
    if (text === expected || text?.includes(expected)) return true;
  }
  return false;
}

/**
 * Count sources in the sidebar via two independent anchors:
 *
 *   1. `.single-source-container` — the per-row sidebar element. Most
 *      direct, but only present once the sidebar has hydrated.
 *
 *   2. `.cover-subtitle-source-count` — a header label of the form
 *      `"3 Quellen"` / `"3 sources"`. Robust to a collapsed or partially
 *      hydrated sidebar because it lives in the chat header instead.
 *
 * We return whichever produces a higher count; mismatches between the two
 * usually mean the sidebar hasn't caught up yet, in which case the header
 * is the authoritative ground truth.
 */
export async function countSources(page: Page): Promise<number> {
  let containerCount = 0;
  try {
    containerCount = await page.locator(Selectors.sources.sourceContainer).count();
  } catch {
    /* fall through */
  }

  let headerCount = 0;
  try {
    const headerText = await page
      .locator(".cover-subtitle-source-count")
      .first()
      .textContent({ timeout: 500 })
      .catch(() => null);
    const match = headerText?.match(/(\d+)/);
    if (match) headerCount = parseInt(match[1], 10);
  } catch {
    /* ignore */
  }

  return Math.max(containerCount, headerCount);
}

/**
 * Open the Add-source modal. Order of attempts:
 *   1. Dialog already open → use it (auto-modal on fresh notebooks).
 *   2. Click the sidebar "Add source" button.
 *   3. Last resort: navigate to `?addSource=true`, which auto-opens.
 */
async function openAddSourceOverlay(page: Page): Promise<void> {
  if (await isOverlayVisible(page)) {
    log.info("  ✅ Add-source dialog already open, reusing");
    return;
  }

  // Try the sidebar button first — fastest path on a populated notebook.
  try {
    await page.locator(joinAlt(Selectors.sources.addButton)).first().click({ timeout: 5_000 });
    await page
      .locator(Selectors.sources.overlayPane)
      .first()
      .waitFor({ state: "visible", timeout: 8_000 });
    return;
  } catch (err) {
    log.warning(
      `  ⚠️  Add-source button click failed (${err}), trying ?addSource=true URL fallback`
    );
  }

  // URL fallback — useful when the sidebar button is hidden or covered.
  const url = page.url();
  if (url && /\/notebook\//.test(url) && !url.includes("addSource=true")) {
    const u = new URL(url);
    u.searchParams.set("addSource", "true");
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 15_000 });
    await page
      .locator(Selectors.sources.overlayPane)
      .first()
      .waitFor({ state: "visible", timeout: 10_000 });
    return;
  }

  throw new Error('Could not open the "Add source" dialog');
}

async function isOverlayVisible(page: Page): Promise<boolean> {
  return page
    .locator(Selectors.sources.overlayPane)
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

async function pickSourceType(page: Page, type: SourceType): Promise<void> {
  const candidates =
    type === "url"
      ? Selectors.sources.sourceTypeUrl
      : type === "file"
        ? []
        : Selectors.sources.sourceTypeText;
  const overlay = page.locator(Selectors.sources.overlayPane).first();
  for (const sel of candidates) {
    const target = overlay.locator(sel).first();
    if (await target.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await target.click();
      // Sub-dialog needs a moment to hydrate before we type.
      await safeSleep(page, 500);
      return;
    }
  }
  // Older overlays drop straight to the input (no type picker) — that's fine.
}

async function fillSourceContent(page: Page, input: AddSourceInput): Promise<void> {
  const overlay = page.locator(Selectors.sources.overlayPane).first();

  // Wait for the overlay to actually contain a textarea (the picker swap is
  // animated, so a tight 500 ms wait beats a busy poll).
  await safeSleep(page, 500);

  const inputCandidates = [
    Selectors.sources.overlayTextarea,
    Selectors.sources.overlayInput,
    `${Selectors.sources.overlayPane} textarea:not(.query-box-input):not(.query-box-textarea)`,
  ];

  let target = null;
  for (const sel of inputCandidates) {
    const candidate = page.locator(sel).first();
    if (await candidate.isVisible({ timeout: 2_000 }).catch(() => false)) {
      target = candidate;
      break;
    }
  }

  if (!target) {
    throw new Error(
      "Could not find an input field inside the Add-source overlay. " +
        "NotebookLM UI may have changed — please file an issue."
    );
  }

  // Title goes in a separate input when one is present; otherwise we prefix
  // it onto the text content (Fork's fallback for older overlays).
  let body = input.content ?? "";
  if (input.title && input.type === "text") {
    let titleInputFound = false;
    const titleSelectors = [
      'input[placeholder*="title" i]',
      'input[placeholder*="name" i]',
      'input[name="title"]',
      `${Selectors.sources.overlayPane} input[type="text"]:not([readonly])`,
    ];
    for (const sel of titleSelectors) {
      const candidate = overlay.locator(sel).first();
      if (await candidate.isVisible({ timeout: 500 }).catch(() => false)) {
        await candidate.fill(input.title).catch(() => undefined);
        titleInputFound = true;
        break;
      }
    }
    if (!titleInputFound) {
      body = `${input.title}\n\n${input.content}`;
    }
  }

  await target.fill(body);
  // Small settle delay before clicking submit; Material's primary button
  // briefly stays disabled after `fill()` while validators run.
  await safeSleep(page, 300);
}

async function confirmInsert(page: Page): Promise<void> {
  const overlay = page.locator(Selectors.sources.overlayPane).first();
  for (const sel of Selectors.sources.insertConfirm) {
    const btn = overlay.locator(sel).first();
    if (await btn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      const disabled = await btn.isDisabled().catch(() => false);
      if (disabled) continue;
      await btn.click();
      log.info(`  ✅ submit clicked (selector: ${sel})`);
      return;
    }
  }
  // Fallback: pressing Enter in many flows submits the form.
  log.warning("  ⚠️  No insert button matched, pressing Enter as fallback");
  await page.keyboard.press("Enter");
}

/**
 * Wait until the Add-source modal animates away. NotebookLM only appends the
 * new sidebar entry once the modal is fully gone, so we *must* wait here.
 */
async function waitForOverlayToClose(page: Page, timeoutMs: number = 30_000): Promise<void> {
  await page
    .locator(Selectors.sources.overlayPane)
    .first()
    .waitFor({ state: "hidden", timeout: timeoutMs })
    .catch(() => undefined);
}

async function waitForSourceCountIncrease(
  page: Page,
  before: number,
  timeoutMs: number = 90_000
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await countSources(page);
    if (current > before) return current;
    await safeSleep(page, 500);
  }
  return await countSources(page);
}

/**
 * Look for an error toast / `[role="alert"]` describing why the upload
 * failed. We filter against Material-icon-name leakage (e.g. `more_vert`),
 * which would otherwise produce nonsense error strings.
 */
async function readDialogError(page: Page): Promise<string | null> {
  const errorSelectors = [
    '[role="alert"]:visible',
    ".error-message:visible",
    ".mdc-snackbar--open",
  ];
  const ICON_LEAKS = ["more_vert", "more_horiz", "open_in_new", "content_copy"];

  for (const sel of errorSelectors) {
    try {
      const el = page.locator(sel).first();
      if (!(await el.isVisible({ timeout: 300 }).catch(() => false))) continue;
      const txt = (await el.textContent({ timeout: 1_000 }).catch(() => null))?.trim();
      if (!txt || txt.length > 240) continue;
      if (ICON_LEAKS.some((leak) => txt.includes(leak))) continue;
      return txt;
    } catch {
      continue;
    }
  }
  return null;
}
