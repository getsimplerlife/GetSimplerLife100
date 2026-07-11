import { createPcs_tmsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const pcs_tmsActions: ActionDefinition[] = [
  { name: "listPcs_tmsItems", description: "List pcs-tms items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPcs_tmsClient(config); return c.listItems(); } },
  { name: "pcs_tmsHealthCheck", description: "Check pcs-tms connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPcs_tmsClient(config); return { healthy: await c.healthCheck(), provider: "pcs-tms" }; } },
];
