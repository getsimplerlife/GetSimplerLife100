import { createFourkitesClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const fourkitesActions: ActionDefinition[] = [
  { name: "listFourkitesItems", description: "List fourkites items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFourkitesClient(config); return c.listItems(); } },
  { name: "fourkitesHealthCheck", description: "Check fourkites connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFourkitesClient(config); return { healthy: await c.healthCheck(), provider: "fourkites" }; } },
];
