import { createJotformClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const jotformActions: ActionDefinition[] = [
  { name: "listJotformItems", description: "List jotform items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createJotformClient(config); return c.listItems(); } },
  { name: "jotformHealthCheck", description: "Check jotform connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createJotformClient(config); return { healthy: await c.healthCheck(), provider: "jotform" }; } },
];
