import type { Tool } from "@modelcontextprotocol/sdk/types.js";

const sessionId = {
  session_id: {
    type: "string",
    description: "Existing authenticated browser session id from list_sessions or a prior tool result. These diagnostics never create a session.",
  },
};

const selector = {
  selector: {
    type: "string",
    description: "CSS selector evaluated in the current NotebookLM page. Keep it bounded and prefer an aria-label, role, or stable class.",
  },
};

export const debugNavigationTools: Tool[] = [
  {
    name: "create_notebook_debug_session",
    description: "Create a headless NotebookLM debug session without requiring authentication. Returns a session id and safe page diagnostics, including Google sign-in redirects. The session is restricted to notebooklm.google.com and never exposes cookies or storage.",
    inputSchema: { type: "object", properties: { notebook_url: { type: "string", description: "Absolute NotebookLM notebook URL." }, show_browser: { type: "boolean", description: "Show the browser window; default false." } } },
    annotations: { title: "Create NotebookLM debug session", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "inspect_notebook_page",
    description: "Inspect the current DOM/state of an existing NotebookLM debug session. Returns URL, title, a bounded body excerpt, visible interactive elements, selector match counts, and a temporary screenshot path. It never returns cookies, storage, input values, or page HTML.",
    inputSchema: { type: "object", properties: { ...sessionId, selectors: { type: "array", items: { type: "string" }, description: "Optional CSS selectors to count (maximum 32)." }, screenshot: { type: "boolean", description: "Capture a screenshot (default true)." } }, required: ["session_id"] },
    annotations: { title: "Inspect NotebookLM page", readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "navigate_notebook_page",
    description: "Navigate an existing session to another NotebookLM URL. Navigation is restricted to notebooklm.google.com and does not create or authenticate sessions.",
    inputSchema: { type: "object", properties: { ...sessionId, url: { type: "string", description: "Absolute NotebookLM URL." } }, required: ["session_id", "url"] },
    annotations: { title: "Navigate NotebookLM page", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "click_notebook_element",
    description: "Click the first matching element in an existing NotebookLM session. This is a bounded CSS-selector action; arbitrary JavaScript is not supported.",
    inputSchema: { type: "object", properties: { ...sessionId, ...selector, timeout_ms: { type: "number", description: "Action timeout, capped at 15 seconds." } }, required: ["session_id", "selector"] },
    annotations: { title: "Click NotebookLM element", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "type_notebook_element",
    description: "Replace the text of the first matching input or textarea in an existing NotebookLM session. Values are not returned. Text is capped at 10,000 characters.",
    inputSchema: { type: "object", properties: { ...sessionId, ...selector, text: { type: "string", description: "Text to fill, maximum 10,000 characters." }, timeout_ms: { type: "number", description: "Action timeout, capped at 15 seconds." } }, required: ["session_id", "selector", "text"] },
    annotations: { title: "Type in NotebookLM element", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
];
