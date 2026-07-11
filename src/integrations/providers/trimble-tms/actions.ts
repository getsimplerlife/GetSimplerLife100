import { createTrimble_tmsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const trimble_tmsActions: ActionDefinition[] = [
  { name: "listTrimble_tmsItems", description: "List trimble-tms items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTrimble_tmsClient(config); return c.listItems(); } },
  { name: "trimble_tmsHealthCheck", description: "Check trimble-tms connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTrimble_tmsClient(config); return { healthy: await c.healthCheck(), provider: "trimble-tms" }; } },
];
