import { createMotiveClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const motiveActions: ActionDefinition[] = [
  { name: "listMotiveItems", description: "List motive items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMotiveClient(config); return c.listItems(); } },
  { name: "motiveHealthCheck", description: "Check motive connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMotiveClient(config); return { healthy: await c.healthCheck(), provider: "motive" }; } },
];
