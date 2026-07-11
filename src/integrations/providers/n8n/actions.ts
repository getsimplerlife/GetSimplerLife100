import { createN8nClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const n8nActions: ActionDefinition[] = [
  { name: "listN8nItems", description: "List n8n items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createN8nClient(config); return c.listItems(); } },
  { name: "n8nHealthCheck", description: "Check n8n connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createN8nClient(config); return { healthy: await c.healthCheck(), provider: "n8n" }; } },
];
