import { createEgnyteClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const egnyteActions: ActionDefinition[] = [
  { name: "listEgnyteFolder", description: "List Egnyte folder contents", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, handler: async (config, params) => { const c = createEgnyteClient(config); return c.listFolder(params.path); } },
  { name: "searchEgnyteFiles", description: "Search Egnyte files", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createEgnyteClient(config); return c.searchFiles(params.query); } },
  { name: "createEgnyteFolder", description: "Create Egnyte folder", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }, handler: async (config, params) => { const c = createEgnyteClient(config); return c.createFolder(params.path); } },
  { name: "egnyteHealthCheck", description: "Check Egnyte connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEgnyteClient(config); return { healthy: await c.healthCheck(), provider: "egnyte" }; } },
];