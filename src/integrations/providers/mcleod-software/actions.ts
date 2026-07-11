import { createMcLeodClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const mcleodSoftwareActions: ActionDefinition[] = [
  { name: "listMcleodDispatches", description: "List McLeod dispatches", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMcLeodClient(config); return c.listDispatches(); } },
  { name: "mcleodSoftwareHealthCheck", description: "Check McLeod connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMcLeodClient(config); return { healthy: await c.healthCheck(), provider: "mcleod-software" }; } },
];