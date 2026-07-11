import { createUipathClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const uipathActions: ActionDefinition[] = [
  { name: "listUipathItems", description: "List uipath items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createUipathClient(config); return c.listItems(); } },
  { name: "uipathHealthCheck", description: "Check uipath connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createUipathClient(config); return { healthy: await c.healthCheck(), provider: "uipath" }; } },
];
