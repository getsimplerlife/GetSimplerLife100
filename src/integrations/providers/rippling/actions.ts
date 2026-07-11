import { createRipplingClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const ripplingActions: ActionDefinition[] = [
  { name: "listRipplingEmployees", description: "List Rippling employees", inputSchema: { type: "object", properties: { limit: { type: "number" } } }, handler: async (config, params) => { const c = createRipplingClient(config); return c.listEmployees(params.limit); } },
  { name: "ripplingHealthCheck", description: "Check Rippling connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createRipplingClient(config); return { healthy: await c.healthCheck(), provider: "rippling" }; } },
];