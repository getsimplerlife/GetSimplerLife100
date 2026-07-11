import { createRampClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const rampActions: ActionDefinition[] = [
  { name: "listRampTransactions", description: "List Ramp transactions", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createRampClient(config); return c.listTransactions(params.filter); } },
  { name: "listRampCards", description: "List Ramp cards", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createRampClient(config); return c.listCards(); } },
  { name: "rampHealthCheck", description: "Check Ramp connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createRampClient(config); return { healthy: await c.healthCheck(), provider: "ramp" }; } },
];