import { createAscend_tmsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const ascend_tmsActions: ActionDefinition[] = [
  { name: "listAscend_tmsItems", description: "List ascend-tms items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAscend_tmsClient(config); return c.listItems(); } },
  { name: "ascend_tmsHealthCheck", description: "Check ascend-tms connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAscend_tmsClient(config); return { healthy: await c.healthCheck(), provider: "ascend-tms" }; } },
];
