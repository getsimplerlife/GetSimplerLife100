import { createWrikeClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const wrikeActions: ActionDefinition[] = [
  { name: "listWrikeProjects", description: "List Wrike projects", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWrikeClient(config); return c.listProjects(); } },
  { name: "createWrikeTask", description: "Create Wrike task", inputSchema: { type: "object", properties: { folderId: { type: "string" }, title: { type: "string" }, description: { type: "string" }, status: { type: "string" } }, required: ["folderId", "title"] }, handler: async (config, params) => { const c = createWrikeClient(config); return c.createTask(params.folderId, params); } },
  { name: "wrikeHealthCheck", description: "Check Wrike connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWrikeClient(config); return { healthy: await c.healthCheck(), provider: "wrike" }; } },
];