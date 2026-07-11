import { createMakeClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const makeActions: ActionDefinition[] = [
  { name: "listMakeItems", description: "List make items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMakeClient(config); return c.listItems(); } },
  { name: "makeHealthCheck", description: "Check make connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMakeClient(config); return { healthy: await c.healthCheck(), provider: "make" }; } },
];
