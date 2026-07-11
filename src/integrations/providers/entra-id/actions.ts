import { createEntra_idClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const entra_idActions: ActionDefinition[] = [
  { name: "listEntra_idItems", description: "List entra-id items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEntra_idClient(config); return c.listItems(); } },
  { name: "entra_idHealthCheck", description: "Check entra-id connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEntra_idClient(config); return { healthy: await c.healthCheck(), provider: "entra-id" }; } },
];
