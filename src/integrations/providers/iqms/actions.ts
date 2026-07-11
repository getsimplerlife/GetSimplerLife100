import { createIqmsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const iqmsActions: ActionDefinition[] = [
  { name: "listIqmsItems", description: "List iqms items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIqmsClient(config); return c.listItems(); } },
  { name: "iqmsHealthCheck", description: "Check iqms connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIqmsClient(config); return { healthy: await c.healthCheck(), provider: "iqms" }; } },
];
