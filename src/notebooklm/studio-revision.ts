import fs from "node:fs";
import path from "node:path";
import { createLocalTaskId, type JsonTaskRegistry, type LifecycleTask } from "./lifecycle.js";

export interface SlideFeedbackNote {
  slideNumber: number;
  note: string;
}

export interface StudioRevisionInput {
  taskId: string;
  expectedSourceCount: number;
  artifactTitle: string;
  artifactCreatedAt: string;
  slideFeedback: SlideFeedbackNote[];
  globalRevisionPrompt?: string;
}

export interface StudioRevisionRecord {
  id: string;
  taskId: string;
  status: "queued" | "running" | "completed" | "failed" | "incomplete";
  createdAt: string;
  updatedAt: string;
  expectedSourceCount: number;
  artifactTitle: string;
  artifactCreatedAt: string;
  slideFeedback: SlideFeedbackNote[];
  globalRevisionPrompt?: string;
  error?: string;
  nextSteps: string[];
  result?: unknown;
}

export interface StudioRevisionUiAdapter {
  revise(input: StudioRevisionInput, task: LifecycleTask): Promise<{ marker?: string }>;
}

export class JsonRevisionRegistry {
  private records: StudioRevisionRecord[];

  constructor(private readonly filePath: string) {
    this.records = this.load();
  }

  save(record: StudioRevisionRecord): StudioRevisionRecord {
    const next = { ...record, updatedAt: new Date().toISOString() };
    const index = this.records.findIndex((item) => item.id === record.id);
    if (index < 0) this.records.push(next);
    else this.records[index] = next;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.records, null, 2));
    fs.renameSync(temporary, this.filePath);
    return { ...next, slideFeedback: [...next.slideFeedback], nextSteps: [...next.nextSteps] };
  }

  get(id: string): StudioRevisionRecord | undefined {
    const record = this.records.find((item) => item.id === id);
    return record
      ? { ...record, slideFeedback: [...record.slideFeedback], nextSteps: [...record.nextSteps] }
      : undefined;
  }

  private load(): StudioRevisionRecord[] {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return Array.isArray(parsed) ? (parsed as StudioRevisionRecord[]) : [];
    } catch {
      return [];
    }
  }
}

const unsupportedNextSteps = [
  "Open the completed 13-source slide deck in NotebookLM Studio manually.",
  "Verify the deck card, per-slide feedback controls, and revise action before applying feedback.",
  "Retry this tool only after stable selectors and card scoping have been verified; do not target the 16-source artifact.",
];

function validateTarget(
  task: LifecycleTask | undefined,
  input: StudioRevisionInput
): string | undefined {
  if (!task) return `Studio task not found: ${input.taskId}`;
  if (task.artifactType !== "presentation" && task.artifactType !== "slide_deck") {
    return "Revision is only supported for presentation/slide-deck Studio tasks.";
  }
  if (task.status !== "completed") {
    return "The target Studio task is not completed; no revision was started.";
  }
  if (
    input.expectedSourceCount !== 13 ||
    task.expectedSourceCount !== 13 ||
    task.actualSourceCount !== 13
  ) {
    return "Source-count guard failed: revisions are restricted to the completed 13-source artifact; no revision was started.";
  }
  if (task.title !== input.artifactTitle || task.createdAt !== input.artifactCreatedAt) {
    return "Artifact title/created metadata did not match the local task; no revision was started.";
  }
  return undefined;
}

function validateFeedback(input: StudioRevisionInput): string | undefined {
  if (!Array.isArray(input.slideFeedback) || input.slideFeedback.length === 0) {
    return "slide_feedback must contain at least one per-slide note.";
  }
  for (const note of input.slideFeedback) {
    if (!Number.isInteger(note.slideNumber) || note.slideNumber < 1) {
      return "Each slide_feedback.slide_number must be a positive integer.";
    }
    if (typeof note.note !== "string" || note.note.trim().length === 0) {
      return "Each slide_feedback.note must be a non-empty string.";
    }
  }
  return undefined;
}

export async function reviseStudioArtifact(
  registry: JsonTaskRegistry,
  revisions: JsonRevisionRegistry,
  input: StudioRevisionInput,
  adapter?: StudioRevisionUiAdapter
): Promise<StudioRevisionRecord> {
  const task = registry.get(input.taskId);
  const validationError = validateTarget(task, input) ?? validateFeedback(input);
  const now = new Date().toISOString();
  const record: StudioRevisionRecord = {
    id: createLocalTaskId("studio").replace("nlm-local-studio-", "nlm-local-studio-revision-"),
    taskId: input.taskId,
    status: validationError ? "incomplete" : "queued",
    createdAt: now,
    updatedAt: now,
    expectedSourceCount: input.expectedSourceCount,
    artifactTitle: input.artifactTitle,
    artifactCreatedAt: input.artifactCreatedAt,
    slideFeedback: input.slideFeedback,
    globalRevisionPrompt: input.globalRevisionPrompt,
    error: validationError,
    nextSteps: validationError
      ? ["Correct the target metadata or feedback contract and retry."]
      : unsupportedNextSteps,
  };
  if (validationError || !task) return revisions.save(record);
  if (!adapter) {
    return revisions.save({
      ...record,
      status: "incomplete",
      error:
        "Stable Studio revision selectors, card scoping, and feedback controls are not verified by the live UI adapter.",
      nextSteps: unsupportedNextSteps,
    });
  }
  try {
    const started = await adapter.revise(input, task);
    return revisions.save({
      ...record,
      status: "running",
      error: undefined,
      result: started,
      nextSteps: ["Poll the revision record; only observed UI completion may become completed."],
    });
  } catch (error) {
    return revisions.save({
      ...record,
      status: "incomplete",
      error: error instanceof Error ? error.message : String(error),
      nextSteps: unsupportedNextSteps,
    });
  }
}
