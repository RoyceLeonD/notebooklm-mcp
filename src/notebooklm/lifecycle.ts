/** Persisted, local lifecycle contracts for NotebookLM UI-backed tasks. */
import fs from "node:fs";
import path from "node:path";

export type LifecycleKind = "research" | "studio";
export type LifecycleStatus = "queued" | "running" | "completed" | "failed" | "incomplete";

export interface LifecycleTask {
  id: string;
  kind: LifecycleKind;
  status: LifecycleStatus;
  createdAt: string;
  updatedAt: string;
  notebookUrl: string;
  title?: string;
  prompt?: string;
  artifactType?: string;
  detailLevel?: "standard" | "detailed";
  slideCount?: number;
  expectedSourceCount?: number;
  actualSourceCount?: number;
  selectedSourceTitles?: string[];
  selectedSourceCount?: number;
  remoteTaskId?: string;
  result?: unknown;
  error?: string;
  nextSteps?: string[];
}

export function createLocalTaskId(kind: LifecycleKind): string {
  return `nlm-local-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class JsonTaskRegistry {
  private readonly filePath: string;
  private tasks: LifecycleTask[];

  constructor(filePath: string) {
    this.filePath = filePath;
    this.tasks = this.load();
  }

  list(kind?: LifecycleKind): LifecycleTask[] {
    return this.tasks.filter((task) => !kind || task.kind === kind).map((task) => ({ ...task }));
  }

  get(id: string): LifecycleTask | undefined {
    const task = this.tasks.find((item) => item.id === id);
    return task ? { ...task } : undefined;
  }

  save(task: LifecycleTask): LifecycleTask {
    const index = this.tasks.findIndex((item) => item.id === task.id);
    const next = { ...task, updatedAt: new Date().toISOString() };
    if (index < 0) this.tasks.push(next);
    else this.tasks[index] = next;
    this.persist();
    return { ...next };
  }

  update(id: string, patch: Partial<LifecycleTask>): LifecycleTask | undefined {
    const task = this.get(id);
    return task ? this.save({ ...task, ...patch, id }) : undefined;
  }

  private load(): LifecycleTask[] {
    try {
      const value = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.tasks, null, 2));
    fs.renameSync(temp, this.filePath);
  }
}

export function incomplete(
  message: string,
  nextSteps: string[] = []
): Pick<LifecycleTask, "status" | "error" | "nextSteps"> {
  return { status: "incomplete", error: message, nextSteps };
}
