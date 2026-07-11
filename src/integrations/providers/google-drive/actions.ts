import { createGDriveClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const gdriveActions: ActionDefinition[] = [
  { name: "listGDriveFiles", description: "List Google Drive files", inputSchema: { type: "object", properties: { query: { type: "string" }, pageSize: { type: "number" } } }, handler: async (config, params) => { const c = createGDriveClient(config); return c.listFiles(params.query, params.pageSize); } },
  { name: "searchGDriveFiles", description: "Search Google Drive files by name", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createGDriveClient(config); return c.searchFiles(params.query); } },
  { name: "createGDriveFolder", description: "Create folder in Google Drive", inputSchema: { type: "object", properties: { name: { type: "string" }, parentId: { type: "string" } }, required: ["name"] }, handler: async (config, params) => { const c = createGDriveClient(config); return c.createFolder(params.name, params.parentId); } },
  { name: "gdriveHealthCheck", description: "Check Google Drive connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGDriveClient(config); return { healthy: await c.healthCheck(), provider: "google-drive" }; } },
];