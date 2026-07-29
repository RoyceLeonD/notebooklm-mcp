import type { Tool } from "@modelcontextprotocol/sdk/types.js";
export const collectionTools: Tool[] = [
  {
    name: "create_collection",
    description:
      "Create local library metadata. Collections are not synced to Google; NotebookLM has no public collection API.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
    },
  },
  {
    name: "list_collections",
    description: "List local notebook collections.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_collection",
    description: "Get one local collection.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "update_collection",
    description: "Update local collection metadata.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
  },
  {
    name: "remove_collection",
    description: "Remove a local collection; notebooks and Google notebooks are not deleted.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "assign_notebook_collection",
    description: "Assign or unassign a library notebook to a local collection.",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string" },
        notebook_id: { type: "string" },
        assigned: { type: "boolean" },
      },
      required: ["collection_id", "notebook_id"],
    },
  },
];
