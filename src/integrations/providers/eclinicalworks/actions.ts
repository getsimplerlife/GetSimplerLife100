import { createEclinicalworksClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const eclinicalworksActions: ActionDefinition[] = [
  { name: "listEclinicalworksItems", description: "List eclinicalworks items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEclinicalworksClient(config); return c.listItems(); } },
  { name: "eclinicalworksHealthCheck", description: "Check eclinicalworks connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEclinicalworksClient(config); return { healthy: await c.healthCheck(), provider: "eclinicalworks" }; } },
];
