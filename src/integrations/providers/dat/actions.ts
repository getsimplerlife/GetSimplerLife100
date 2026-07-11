import { createDatClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const datActions: ActionDefinition[] = [
  { name: "listDatItems", description: "List dat items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDatClient(config); return c.listItems(); } },
  { name: "datHealthCheck", description: "Check dat connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDatClient(config); return { healthy: await c.healthCheck(), provider: "dat" }; } },
];
