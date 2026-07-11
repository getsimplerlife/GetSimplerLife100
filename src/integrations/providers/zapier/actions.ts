import { createZapierClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const zapierActions: ActionDefinition[] = [
  { name: "listZapierItems", description: "List zapier items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createZapierClient(config); return c.listItems(); } },
  { name: "zapierHealthCheck", description: "Check zapier connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createZapierClient(config); return { healthy: await c.healthCheck(), provider: "zapier" }; } },
];
