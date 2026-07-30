import test from "node:test";
import assert from "node:assert/strict";
import { debugNavigationTools } from "../src/tools/definitions/debug-navigation.js";

test("headless debug tools expose bounded contracts", () => {
  const names = debugNavigationTools.map((tool) => tool.name);
  assert.deepEqual(names, [
    "create_notebook_debug_session",
    "inspect_notebook_page",
    "navigate_notebook_page",
    "click_notebook_element",
    "type_notebook_element",
  ]);
  const createTool = debugNavigationTools.find((tool) => tool.name === "create_notebook_debug_session")!;
  assert.deepEqual(createTool.inputSchema.type, "object");
  assert.doesNotMatch(createTool.description, /authenticated session/i);
  for (const tool of debugNavigationTools.filter((candidate) => candidate.name !== "create_notebook_debug_session")) {
    assert.deepEqual(tool.inputSchema.type, "object");
    assert.ok(tool.inputSchema.required?.includes("session_id"));
    assert.match(tool.description, /existing|current/i);
  }
  const typeTool = debugNavigationTools.find((tool) => tool.name === "type_notebook_element")!;
  assert.equal((typeTool.inputSchema.properties.text as { description: string }).description.includes("10,000"), true);
});

test("navigation tool documents the NotebookLM-only URL boundary", () => {
  const tool = debugNavigationTools.find((candidate) => candidate.name === "navigate_notebook_page")!;
  assert.match(tool.description, /restricted to (official )?notebooklm/i);
});
