import { createLocalTaskId, type JsonTaskRegistry, type LifecycleTask } from "./lifecycle.js";

export interface StudioInput {
  notebookUrl: string;
  artifactType: "audio_overview" | "presentation" | "slide_deck";
  prompt?: string;
  detailLevel?: "standard" | "detailed";
  slideCount?: number;
  expectedSourceCount?: number;
  actualSourceCount?: number;
  selectedSourceTitles?: string[];
}
export interface StudioArtifactResult {
  success: boolean;
  status: "completed" | "incomplete" | "failed";
  filePath?: string;
  message?: string;
  nextSteps: string[];
}
export interface StudioUiAdapter {
  start(input: StudioInput): Promise<{ marker?: string; remoteTaskId?: string }>;
  read(): Promise<Partial<LifecycleTask> & { status: LifecycleTask["status"] }>;
  download(destinationDir: string): Promise<{ filePath: string }>;
}

export async function createStudioTask(
  registry: JsonTaskRegistry,
  input: StudioInput,
  adapter?: StudioUiAdapter
): Promise<LifecycleTask> {
  const now = new Date().toISOString();
  const task: LifecycleTask = {
    id: createLocalTaskId("studio"),
    kind: "studio",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    notebookUrl: input.notebookUrl,
    prompt: input.prompt,
    artifactType: input.artifactType,
    detailLevel: input.detailLevel,
    slideCount: input.slideCount,
    expectedSourceCount: input.expectedSourceCount,
    actualSourceCount: input.actualSourceCount,
    selectedSourceTitles: input.selectedSourceTitles,
    selectedSourceCount: input.selectedSourceTitles?.length,
    nextSteps: ["Poll get_studio_task until a verified terminal state is observed."],
  };
  const saved = registry.save(task);
  if (!adapter && input.artifactType !== "audio_overview") {
    return registry.update(saved.id, {
      status: "incomplete",
      error: "Presentation/slide-deck controls are not verified by the current UI integration.",
      nextSteps: [
        "Use the NotebookLM Studio UI manually; do not treat this local task as started.",
      ],
    })!;
  }
  if (!adapter) return saved;
  if (
    input.expectedSourceCount !== undefined &&
    input.actualSourceCount !== input.expectedSourceCount
  )
    return registry.update(saved.id, {
      status: "incomplete",
      error: "Source count verification failed; artifact was not started.",
      nextSteps: ["Refresh the source inventory and retry with the actual count."],
    })!;
  try {
    const started = await adapter.start(input);
    return registry.update(saved.id, {
      status: "running",
      remoteTaskId: started.remoteTaskId,
      result: { marker: started.marker },
    })!;
  } catch (error) {
    return registry.update(saved.id, {
      status: "incomplete",
      error: error instanceof Error ? error.message : String(error),
      nextSteps: ["Open the Studio panel and retry after confirming the notebook is loaded."],
    })!;
  }
}

export async function getStudioTask(
  registry: JsonTaskRegistry,
  id: string,
  adapter?: StudioUiAdapter
): Promise<LifecycleTask | undefined> {
  const task = registry.get(id);
  if (!task || !adapter || task.status === "completed" || task.status === "failed") return task;
  if (task.artifactType !== "audio_overview") return task;
  try {
    return registry.update(id, await adapter.read())!;
  } catch (error) {
    return registry.update(id, {
      status: "incomplete",
      error: error instanceof Error ? error.message : String(error),
      nextSteps: ["Retry status polling after reinitializing the NotebookLM session."],
    })!;
  }
}

export function listStudioTasks(registry: JsonTaskRegistry): LifecycleTask[] {
  return registry.list("studio");
}

export async function downloadStudioArtifact(
  registry: JsonTaskRegistry,
  id: string,
  destinationDir: string,
  adapter?: StudioUiAdapter
): Promise<StudioArtifactResult> {
  const task = registry.get(id);
  if (!task)
    return {
      success: false,
      status: "failed",
      message: `Studio task not found: ${id}`,
      nextSteps: [],
    };
  if (task.artifactType !== "audio_overview")
    return {
      success: false,
      status: "incomplete",
      message: "Presentation/slide-deck download is not verified by the current UI integration.",
      nextSteps: [
        "Use the NotebookLM Studio UI to download the artifact, then record its path externally.",
      ],
    };
  if (!adapter)
    return {
      success: false,
      status: "incomplete",
      message: "No verified Studio download adapter is configured.",
      nextSteps: [
        "Poll get_studio_task and use the existing download_audio tool for Audio Overview.",
      ],
    };
  try {
    const result = await adapter.download(destinationDir);
    registry.update(id, { status: "completed", result });
    return { success: true, status: "completed", filePath: result.filePath, nextSteps: [] };
  } catch (error) {
    return {
      success: false,
      status: "failed",
      message: error instanceof Error ? error.message : String(error),
      nextSteps: ["Retry after the artifact reports ready."],
    };
  }
}
