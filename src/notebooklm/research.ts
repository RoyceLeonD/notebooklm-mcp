import { createLocalTaskId, type JsonTaskRegistry, type LifecycleTask } from "./lifecycle.js";

export interface ResearchInput {
  notebookUrl: string;
  prompt: string;
  selectedSourceTitles?: string[];
}
export interface ResearchStatus {
  status: LifecycleTask["status"];
  marker?: string;
  reportText?: string;
  sources?: unknown[];
  message?: string;
  nextSteps?: string[];
}

export interface ResearchUiAdapter {
  start(input: ResearchInput): Promise<{ marker?: string; remoteTaskId?: string }>;
  read(): Promise<ResearchStatus>;
}

export async function createResearchTask(
  registry: JsonTaskRegistry,
  input: ResearchInput,
  adapter?: ResearchUiAdapter
): Promise<LifecycleTask> {
  const now = new Date().toISOString();
  const task: LifecycleTask = {
    id: createLocalTaskId("research"),
    kind: "research",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    notebookUrl: input.notebookUrl,
    prompt: input.prompt,
    selectedSourceTitles: input.selectedSourceTitles,
    selectedSourceCount: input.selectedSourceTitles?.length,
    nextSteps: ["Poll get_research_task until the UI reports a verified terminal state."],
  };
  const saved = registry.save(task);
  if (!adapter) return saved;
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
      nextSteps: ["Open Research in NotebookLM and retry after confirming the notebook is loaded."],
    })!;
  }
}

export async function getResearchTask(
  registry: JsonTaskRegistry,
  id: string,
  adapter?: ResearchUiAdapter
): Promise<LifecycleTask | undefined> {
  const task = registry.get(id);
  if (!task || !adapter || task.status === "completed" || task.status === "failed") return task;
  try {
    const status = await adapter.read();
    return registry.update(id, { ...status, nextSteps: status.nextSteps ?? task.nextSteps })!;
  } catch (error) {
    return registry.update(id, {
      status: "incomplete",
      error: error instanceof Error ? error.message : String(error),
      nextSteps: ["Retry status polling after reinitializing the NotebookLM session."],
    });
  }
}

export function researchStatusFromDom(text: string): ResearchStatus {
  if (/writing report|researching websites|planning|generating/i.test(text)) {
    const marker = text.match(/planning|researching websites|writing report|generating/i)?.[0];
    return { status: "running", marker };
  }
  if (/report ready|research complete|sources found/i.test(text))
    return { status: "completed", marker: "report-ready" };
  return {
    status: "incomplete",
    message: "No verified research state marker was observed.",
    nextSteps: ["Keep the Research panel open and poll again."],
  };
}

export function listResearchTasks(registry: JsonTaskRegistry): LifecycleTask[] {
  return registry.list("research");
}
export function importResearchSources(task: LifecycleTask): ResearchStatus {
  if (task.status !== "completed")
    return {
      status: "incomplete",
      message: "Research sources cannot be imported before a verified completed result.",
      nextSteps: ["Poll the research task until report-ready is observed."],
    };
  return {
    status: "incomplete",
    message: "Automatic research-source import is not verified by the current UI integration.",
    nextSteps: ["Use get_research_sources to inspect metadata, then add_source each verified URL."],
  };
}
