import { createUKGClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const ukgActions: ActionDefinition[] = [
  { name: "listUKGEmployees", description: "List UKG employees", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createUKGClient(config); return c.listEmployees(); } },
  { name: "ukgHealthCheck", description: "Check UKG connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createUKGClient(config); return { healthy: await c.healthCheck(), provider: "ukg" }; } },
];