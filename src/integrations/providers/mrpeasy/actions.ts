import { createMrpeasyClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const mrpeasyActions: ActionDefinition[] = [
  { name: "listMrpeasyItems", description: "List mrpeasy items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMrpeasyClient(config); return c.listItems(); } },
  { name: "mrpeasyHealthCheck", description: "Check mrpeasy connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMrpeasyClient(config); return { healthy: await c.healthCheck(), provider: "mrpeasy" }; } },
];
