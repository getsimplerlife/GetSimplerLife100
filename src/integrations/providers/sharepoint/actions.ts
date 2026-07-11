import { createSPClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const sharepointActions: ActionDefinition[] = [
  { name: "listSPDrives", description: "List SharePoint drives/libraries", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSPClient(config); return c.listDrives(); } },
  { name: "listSPItems", description: "List SharePoint drive items", inputSchema: { type: "object", properties: { driveId: { type: "string" }, folderId: { type: "string" } }, required: ["driveId"] }, handler: async (config, params) => { const c = createSPClient(config); return c.listItems(params.driveId, params.folderId); } },
  { name: "searchSPFiles", description: "Search SharePoint files", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createSPClient(config); return c.searchFiles(params.query); } },
  { name: "sharepointHealthCheck", description: "Check SharePoint connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSPClient(config); return { healthy: await c.healthCheck(), provider: "sharepoint" }; } },
];