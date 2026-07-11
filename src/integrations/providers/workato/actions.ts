import { createWorkatoClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const workatoActions: ActionDefinition[] = [
  { name: "listWorkatoItems", description: "List workato items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWorkatoClient(config); return c.listItems(); } },
  { name: "workatoHealthCheck", description: "Check workato connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWorkatoClient(config); return { healthy: await c.healthCheck(), provider: "workato" }; } },
];
