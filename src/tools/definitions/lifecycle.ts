import type { Tool } from "@modelcontextprotocol/sdk/types.js";
const target = {
  notebook_url: { type: "string", description: "Explicit NotebookLM notebook URL." },
};
export const lifecycleTools: Tool[] = [
  {
    name: "list_sources",
    description: "Read verified source metadata from the live NotebookLM DOM.",
    inputSchema: {
      type: "object",
      properties: { session_id: { type: "string" }, notebook_id: { type: "string" }, ...target },
    },
  },
  {
    name: "get_source",
    description: "Read one verified source by its zero-based live DOM index.",
    inputSchema: {
      type: "object",
      properties: {
        index: { type: "integer" },
        session_id: { type: "string" },
        notebook_id: { type: "string" },
        ...target,
      },
      required: ["index"],
    },
  },
  {
    name: "update_source",
    description: "Report the current explicit unsupported state for source updates.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "remove_source",
    description: "Report the current explicit unsupported state for source removal.",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "retry_source",
    description: "Retry one source ingestion with bounded attempts and structured diagnostics.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["url", "text"] },
        content: { type: "string" },
        title: { type: "string" },
        session_id: { type: "string" },
        notebook_id: { type: "string" },
        ...target,
      },
      required: ["type", "content"],
    },
  },
  {
    name: "create_research_task",
    description:
      "Create a persisted local research task. The local id is not a remote NotebookLM id.",
    inputSchema: {
      type: "object",
      properties: {
        ...target,
        prompt: { type: "string" },
        selected_source_titles: { type: "array", items: { type: "string" } },
      },
      required: ["notebook_url", "prompt"],
    },
  },
  {
    name: "get_research_task",
    description: "Read a persisted research task and verified UI state.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "list_research_tasks",
    description: "List persisted local research tasks.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_research_sources",
    description: "Retrieve research source metadata only when a verified result exists.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "import_research_sources",
    description:
      "Import research sources when supported; otherwise return explicit incomplete state.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "create_studio_task",
    description:
      "Create a persisted Studio task with source and slide parameters; local id is distinct from any remote id.",
    inputSchema: {
      type: "object",
      properties: {
        ...target,
        artifact_type: { type: "string", enum: ["audio_overview", "presentation", "slide_deck"] },
        prompt: { type: "string" },
        detail_level: { type: "string", enum: ["standard", "detailed"] },
        slide_count: { type: "integer" },
        expected_source_count: { type: "integer" },
        actual_source_count: { type: "integer" },
        selected_source_titles: { type: "array", items: { type: "string" } },
      },
      required: ["notebook_url", "artifact_type"],
    },
  },
  {
    name: "get_studio_task",
    description: "Read a persisted Studio task and honest completion state.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "list_studio_tasks",
    description: "List persisted local Studio tasks.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "download_studio_artifact",
    description:
      "Download a verified Studio artifact; unsupported presentations return incomplete, never success.",
    inputSchema: {
      type: "object",
      properties: { task_id: { type: "string" }, destination_dir: { type: "string" } },
      required: ["task_id", "destination_dir"],
    },
  },
];
