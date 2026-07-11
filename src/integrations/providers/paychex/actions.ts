import { createPaychexClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const paychexActions: ActionDefinition[] = [
  { name: "listPaychexWorkers", description: "List Paychex workers", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPaychexClient(config); return c.listWorkers(); } },
  { name: "paychexHealthCheck", description: "Check Paychex connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPaychexClient(config); return { healthy: await c.healthCheck(), provider: "paychex" }; } },
];