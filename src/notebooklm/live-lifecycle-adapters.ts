import type { Page } from "patchright";
import type { BrowserSession } from "../session/browser-session.js";
import {
  generateAudioOverview,
  getAudioStatusOnPage,
  downloadAudioOverview,
  type GenerateAudioOptions,
} from "./audio.js";
import { researchStatusFromDom, type ResearchInput, type ResearchUiAdapter } from "./research.js";
import type { StudioInput, StudioUiAdapter } from "./studio-lifecycle.js";

const RESEARCH_OPENERS = [
  'button:has-text("Research")',
  '[role="button"]:has-text("Research")',
  'button:has-text("Recherche")',
  'button:has-text("Recherche approfondie")',
  'button:has-text("Deep Research")',
];
const RESEARCH_SUBMITTERS = [
  'button:has-text("Start")',
  'button:has-text("Research")',
  'button:has-text("Search")',
  'button:has-text("Begin")',
  'button[type="submit"]',
];

async function firstVisible(page: Page, selectors: string[], description: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible({ timeout: 500 }).catch(() => false)) return locator;
  }
  throw new Error(`${description} was not observed in the live NotebookLM DOM`);
}

async function bodyText(page: Page): Promise<string> {
  return (await page.locator("body").innerText({ timeout: 1_000 }).catch(() => "")) ?? "";
}

/** Adapter for the Research panel. It only reports success after observing the
 * actual prompt field and submit control; no remote task id is fabricated. */
export class BrowserResearchUiAdapter implements ResearchUiAdapter {
  constructor(private readonly session: BrowserSession) {}

  async start(input: ResearchInput): Promise<{ marker?: string; remoteTaskId?: string }> {
    const page = this.session.getPage();
    if (!page) throw new Error("NotebookLM page is not initialized");
    const opener = await firstVisible(page, RESEARCH_OPENERS, "Research panel opener");
    await opener.click();
    const prompt = page.locator('[role="dialog"] textarea, [role="dialog"] input[type="text"], textarea').first();
    if (!(await prompt.isVisible({ timeout: 1_500 }).catch(() => false))) {
      throw new Error("Research prompt field was not observed after opening the Research panel");
    }
    await prompt.fill(input.prompt);
    const submit = await firstVisible(page, RESEARCH_SUBMITTERS, "Research submit control");
    await submit.click();
    const marker = (await bodyText(page)).match(/planning|researching websites|writing report|generating/i)?.[0];
    if (!marker) throw new Error("Research start was not verified by a live progress marker");
    return { marker };
  }

  async read() {
    const page = this.session.getPage();
    if (!page) throw new Error("NotebookLM page is not initialized");
    return researchStatusFromDom(await bodyText(page));
  }
}

/** Audio Overview is the only Studio lifecycle flow with verified selectors
 * and a verified BrowserSession download path. Slide decks remain explicit
 * incomplete rather than being matched to an unrelated card. */
export class BrowserStudioUiAdapter implements StudioUiAdapter {
  constructor(private readonly session: BrowserSession) {}

  private page(): Page {
    const page = this.session.getPage();
    if (!page) throw new Error("NotebookLM page is not initialized");
    return page;
  }

  async start(input: StudioInput): Promise<{ marker?: string; remoteTaskId?: string }> {
    if (input.artifactType !== "audio_overview") {
      throw new Error("Presentation/slide-deck creation is not verified by the live UI adapter");
    }
    const result = await generateAudioOverview(this.page(), {
      customPrompt: input.prompt,
      waitForCompletion: false,
    } satisfies GenerateAudioOptions);
    if (result.status === "error") throw new Error(result.message ?? "Audio Overview generation failed");
    return { marker: result.status };
  }

  async read() {
    const result = await getAudioStatusOnPage(this.page());
    if (result.status === "ready") return { status: "completed" as const, result: result };
    if (result.status === "in_progress" || result.status === "started") {
      return { status: "running" as const, result };
    }
    return {
      status: "incomplete" as const,
      message: result.message ?? "Audio Overview has not started",
      nextSteps: ["Trigger Audio Overview generation, then poll again."],
    };
  }

  async download(destinationDir: string): Promise<{ filePath: string }> {
    const result = await downloadAudioOverview(this.page(), destinationDir);
    if (!result.success || !result.filePath) {
      throw new Error(result.message ?? "Audio Overview download was not verified");
    }
    return { filePath: result.filePath };
  }
}
