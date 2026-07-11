import { createAircallClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const aircallActions: ActionDefinition[] = [
  { name: "listAircallCalls", description: "List Aircall calls", inputSchema: { type: "object", properties: { limit: { type: "number" } } }, handler: async (config, params) => { const c = createAircallClient(config); return c.listCalls(params.limit); } },
  { name: "listAircallContacts", description: "List Aircall contacts", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAircallClient(config); return c.listContacts(); } },
  { name: "listAircallUsers", description: "List Aircall users", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAircallClient(config); return c.listUsers(); } },
  { name: "aircallHealthCheck", description: "Check Aircall connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAircallClient(config); return { healthy: await c.healthCheck(), provider: "aircall" }; } },
];