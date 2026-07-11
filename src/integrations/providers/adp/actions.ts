import { createADPClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const adpActions: ActionDefinition[] = [
  { name: "listADPWorkers", description: "List ADP workers", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createADPClient(config); return c.listWorkers(); } },
  { name: "getADPWorker", description: "Get ADP worker details", inputSchema: { type: "object", properties: { associateOID: { type: "string" } }, required: ["associateOID"] }, handler: async (config, params) => { const c = createADPClient(config); return c.getWorker(params.associateOID); } },
  { name: "adpHealthCheck", description: "Check ADP connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createADPClient(config); return { healthy: await c.healthCheck(), provider: "adp" }; } },
];