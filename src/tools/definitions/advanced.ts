import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export const advancedTools: Tool[] = [
  {
    name: "create_notebook",
    description:
      "Create a NotebookLM notebook through the authenticated web UI and register it locally. Requires an authenticated browser session; selectors are UI-only and may change.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        topics: { type: "array", items: { type: "string" } },
        show_browser: { type: "boolean" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_sources",
    description:
      "Ingest multiple local Markdown files, URLs, and text in one operation. Returns per-source results and success count.",
    inputSchema: {
      type: "object",
      properties: {
        sources: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["markdown", "url", "text"] },
              path: { type: "string" },
              url: { type: "string" },
              text: { type: "string" },
              title: { type: "string" },
            },
            required: ["type"],
          },
        },
        session_id: { type: "string" },
        notebook_id: { type: "string" },
        notebook_url: { type: "string" },
        show_browser: { type: "boolean" },
      },
      required: ["sources"],
    },
  },
  {
    name: "studio_artifact",
    description:
      "Safe Studio artifact abstraction. Currently supports Audio Overview generation/status/download through verified UI controls; other artifact types return an explicit unsupported limitation rather than using private endpoints.",
    inputSchema: {
      type: "object",
      properties: {
        operation: { type: "string", enum: ["generate", "status", "download"] },
        artifact_type: {
          type: "string",
          enum: [
            "audio_overview",
            "video",
            "mindmap",
            "quiz",
            "infographic",
            "datatable",
            "presentation",
          ],
        },
        custom_prompt: { type: "string" },
        destination_dir: { type: "string" },
        wait_for_completion: { type: "boolean" },
        session_id: { type: "string" },
        notebook_id: { type: "string" },
        notebook_url: { type: "string" },
      },
      required: ["operation", "artifact_type"],
    },
  },
];
