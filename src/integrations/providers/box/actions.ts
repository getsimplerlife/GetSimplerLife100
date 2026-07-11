import { createBoxClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const boxActions: ActionDefinition[] = [
  { name: "listBoxFolder", description: "List Box folder items", inputSchema: { type: "object", properties: { folderId: { type: "string" } } }, handler: async (config, params) => { const c = createBoxClient(config); return c.listFolder(params.folderId); } },
  { name: "searchBoxFiles", description: "Search Box files", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] }, handler: async (config, params) => { const c = createBoxClient(config); return c.searchFiles(params.query, params.limit); } },
  { name: "createBoxFolder", description: "Create Box folder", inputSchema: { type: "object", properties: { name: { type: "string" }, parentId: { type: "string" } }, required: ["name"] }, handler: async (config, params) => { const c = createBoxClient(config); return c.createFolder(params.name, params.parentId); } },
  { name: "boxHealthCheck", description: "Check Box connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBoxClient(config); return { healthy: await c.healthCheck(), provider: "box" }; } },
];