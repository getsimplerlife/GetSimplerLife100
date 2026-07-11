import { createSamsaraClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const samsaraActions: ActionDefinition[] = [
  { name: "listSamsaraItems", description: "List samsara items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSamsaraClient(config); return c.listItems(); } },
  { name: "samsaraHealthCheck", description: "Check samsara connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSamsaraClient(config); return { healthy: await c.healthCheck(), provider: "samsara" }; } },
];
