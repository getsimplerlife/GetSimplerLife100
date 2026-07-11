import { createAcuityClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const acuityActions: ActionDefinition[] = [
  { name: "listAcuityItems", description: "List acuity items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAcuityClient(config); return c.listItems(); } },
  { name: "acuityHealthCheck", description: "Check acuity connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAcuityClient(config); return { healthy: await c.healthCheck(), provider: "acuity" }; } },
];
