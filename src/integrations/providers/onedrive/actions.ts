import { createODClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const onedriveActions: ActionDefinition[] = [
  { name: "listODItems", description: "List OneDrive root items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createODClient(config); return c.listRootItems(); } },
  { name: "searchODFiles", description: "Search OneDrive files", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createODClient(config); return c.searchFiles(params.query); } },
  { name: "uploadODFile", description: "Upload file to OneDrive", inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] }, handler: async (config, params) => { const c = createODClient(config); return c.uploadFile(params.path, params.content); } },
  { name: "createODShareLink", description: "Create OneDrive sharing link", inputSchema: { type: "object", properties: { id: { type: "string" }, type: { type: "string" } }, required: ["id"] }, handler: async (config, params) => { const c = createODClient(config); return c.createShareLink(params.id, params.type); } },
  { name: "onedriveHealthCheck", description: "Check OneDrive connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createODClient(config); return { healthy: await c.healthCheck(), provider: "onedrive" }; } },
];