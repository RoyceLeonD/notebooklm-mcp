import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  JsonTaskRegistry,
  createLocalTaskId,
  type LifecycleTask,
} from "../src/notebooklm/lifecycle.js";
import {
  retrySourceOperation,
  unsupportedSourceMutation,
} from "../src/notebooklm/source-catalog.js";
import { createResearchTask, getResearchTask } from "../src/notebooklm/research.js";
import { createStudioTask, downloadStudioArtifact } from "../src/notebooklm/studio-lifecycle.js";

test("persists local task ids and state across registry instances", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nlm-lifecycle-"));
  const file = path.join(dir, "tasks.json");
  const first = new JsonTaskRegistry(file);
  const task: LifecycleTask = {
    id: createLocalTaskId("research"),
    kind: "research",
    status: "queued",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    notebookUrl: "https://notebooklm.google.com/notebook/abc",
    prompt: "find facts",
  };
  first.save(task);
  const second = new JsonTaskRegistry(file);
  assert.deepEqual(second.get(task.id), { ...task, updatedAt: second.get(task.id)!.updatedAt });
  assert.match(task.id, /^nlm-local-research-/);
});

test("retry returns honest attempts and stops after success", async () => {
  let attempts = 0;
  const result = await retrySourceOperation(async () => {
    attempts += 1;
    if (attempts < 2) throw new Error("network timeout");
    return "ok";
  }, 3);
  assert.deepEqual(result, { success: true, value: "ok", attempts: 2 });
});

test("unsupported source mutations are explicit and actionable", () => {
  const result = unsupportedSourceMutation("remove");
  assert.equal(result.success, false);
  assert.equal(result.failureClass, "unsupported");
  assert.match(result.nextSteps[0], /NotebookLM UI/i);
});

test("research task creation is queued without inventing a remote id", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nlm-research-"));
  const registry = new JsonTaskRegistry(path.join(dir, "tasks.json"));
  const result = await createResearchTask(registry, {
    notebookUrl: "https://notebooklm.google.com/notebook/abc",
    prompt: "compare sources",
  });
  assert.equal(result.status, "queued");
  assert.equal(result.remoteTaskId, undefined);
  assert.equal((await getResearchTask(registry, result.id))?.status, "queued");
});

test("studio download refuses unsupported artifacts instead of claiming success", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nlm-studio-"));
  const registry = new JsonTaskRegistry(path.join(dir, "tasks.json"));
  const task = await createStudioTask(registry, {
    notebookUrl: "https://notebooklm.google.com/notebook/abc",
    artifactType: "presentation",
    prompt: "make slides",
    detailLevel: "detailed",
    slideCount: 10,
  });
  assert.equal(task.status, "incomplete");
  const result = await downloadStudioArtifact(registry, task.id, "/tmp");
  assert.equal(result.success, false);
  assert.equal(result.status, "incomplete");
  assert.match(result.nextSteps.join(" "), /unsupported|UI/i);
});
