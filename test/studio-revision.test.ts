import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { JsonTaskRegistry, type LifecycleTask } from "../src/notebooklm/lifecycle.js";
import { JsonRevisionRegistry, reviseStudioArtifact, type StudioRevisionInput } from "../src/notebooklm/studio-revision.js";

function setup(sourceCount = 13) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nlm-revision-test-"));
  const tasks = new JsonTaskRegistry(path.join(dir, "tasks.json"));
  const revisions = new JsonRevisionRegistry(path.join(dir, "revisions.json"));
  const task: LifecycleTask = {
    id: "nlm-local-studio-13",
    kind: "studio",
    status: "completed",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
    notebookUrl: "https://notebooklm.google.com/notebook/test",
    title: "13-source deck",
    artifactType: "slide_deck",
    expectedSourceCount: sourceCount,
    actualSourceCount: sourceCount,
  };
  tasks.save(task);
  return { tasks, revisions, task };
}

function input(taskId: string): StudioRevisionInput {
  return {
    taskId,
    expectedSourceCount: 13,
    artifactTitle: "13-source deck",
    artifactCreatedAt: "2026-07-29T00:00:00.000Z",
    slideFeedback: [{ slideNumber: 2, note: "Clarify the chart labels." }],
    globalRevisionPrompt: "Keep the tone concise.",
  };
}

test("rejects the 16-source artifact before any adapter can run", async () => {
  const { tasks, revisions, task } = setup(16);
  let called = false;
  const record = await reviseStudioArtifact(tasks, revisions, input(task.id), {
    async revise() {
      called = true;
      return { marker: "should-not-run" };
    },
  });
  assert.equal(record.status, "incomplete");
  assert.match(record.error ?? "", /13-source/);
  assert.equal(called, false);
});

test("preserves per-slide notes and global prompt in a repeatable incomplete record", async () => {
  const { tasks, revisions, task } = setup();
  const record = await reviseStudioArtifact(tasks, revisions, input(task.id));
  assert.equal(record.status, "incomplete");
  assert.deepEqual(record.slideFeedback, [{ slideNumber: 2, note: "Clarify the chart labels." }]);
  assert.equal(record.globalRevisionPrompt, "Keep the tone concise.");
  assert.match(record.nextSteps.join(" "), /stable selectors/);
  assert.deepEqual(revisions.get(record.id), record);
});

test("rejects malformed per-slide feedback without claiming success", async () => {
  const { tasks, revisions, task } = setup();
  const bad = { ...input(task.id), slideFeedback: [{ slideNumber: 0, note: "" }] };
  const record = await reviseStudioArtifact(tasks, revisions, bad);
  assert.equal(record.status, "incomplete");
  assert.match(record.error ?? "", /slide_feedback/);
});
