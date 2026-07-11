import { createBoomiClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const boomiActions: ActionDefinition[] = [
  { name: "listBoomiItems", description: "List boomi items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBoomiClient(config); return c.listItems(); } },
  { name: "boomiHealthCheck", description: "Check boomi connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBoomiClient(config); return { healthy: await c.healthCheck(), provider: "boomi" }; } },
];
