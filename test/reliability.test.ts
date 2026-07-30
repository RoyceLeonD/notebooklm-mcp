import test from "node:test";
import assert from "node:assert/strict";
import { classifySourceFailure, sourceTitleForInput, validateFileInput } from "../src/notebooklm/sources.js";
import { buildSourceActionItems } from "../src/notebooklm/batch-sources.js";
import { buildStudioCompletion } from "../src/notebooklm/studio.ts";

test("accepts local PDF/PPT/PPTX file source inputs and derives an identity title", () => {
  const input = { type: "file" as const, filePath: "/tmp/architecture.PDF" };
  validateFileInput(input);
  assert.equal(sourceTitleForInput(input), "architecture.PDF");
});

test("rejects unsupported local file source extensions", () => {
  assert.throws(
    () => validateFileInput({ type: "file", filePath: "/tmp/notes.txt" }),
    /PDF, PPT, or PPTX/i,
  );
});

test("classifies missing native file input as retryable UI failure", () => {
  const diagnostic = classifySourceFailure("did not expose a native input[type=file] control", "file");
  assert.equal(diagnostic.failureClass, "ui_not_ready");
  assert.equal(diagnostic.retryable, true);
});
test("classifies a missing NotebookLM source dialog as retryable UI failure", () => {
  const diagnostic = classifySourceFailure("Could not open the Add source dialog", "url");
  assert.equal(diagnostic.failureClass, "ui_not_ready");
  assert.equal(diagnostic.retryable, true);
  assert.match(diagnostic.nextSteps[0], /retry/i);
});

test("returns actionable items for unresolved source URLs", () => {
  const items = buildSourceActionItems([
    {
      index: 1,
      source: { type: "url", url: "https://bad.example" },
      result: {
        success: false,
        type: "url",
        sourceCountBefore: 2,
        sourceCountAfter: 2,
        failureClass: "source_unavailable",
        retryable: false,
        nextSteps: ["Check the URL"],
        message: "crawl failed",
      },
    },
  ]);
  assert.deepEqual(items, [
    {
      index: 1,
      url: "https://bad.example",
      failureClass: "source_unavailable",
      retryable: false,
      nextSteps: ["Check the URL"],
    },
  ]);
});

test("builds explicit Studio completion with detailed slide-deck options and source verification", () => {
  const completion = buildStudioCompletion({
    artifactType: "presentation",
    status: "ready",
    expectedSourceCount: 18,
    actualSourceCount: 18,
    slideCount: 24,
    detailLevel: "detailed",
  });
  assert.equal(completion.completionState, "completed");
  assert.equal(completion.sourceCountVerified, true);
  assert.equal(completion.slideCount, 24);
  assert.equal(completion.detailLevel, "detailed");
});
