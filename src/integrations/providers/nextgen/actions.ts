import { createNextgenClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const nextgenActions: ActionDefinition[] = [
  { name: "listNextgenItems", description: "List nextgen items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createNextgenClient(config); return c.listItems(); } },
  { name: "nextgenHealthCheck", description: "Check nextgen connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createNextgenClient(config); return { healthy: await c.healthCheck(), provider: "nextgen" }; } },
];
