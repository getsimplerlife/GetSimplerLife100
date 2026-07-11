import { createSigmaClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const sigmaActions: ActionDefinition[] = [
  { name: "listSigmaConnections", description: "List Sigma connections", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSigmaClient(config); return c.listConnections(); } },
  { name: "listSigmaDatasets", description: "List Sigma datasets", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSigmaClient(config); return c.listDatasets(); } },
  { name: "sigmaHealthCheck", description: "Check Sigma connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSigmaClient(config); return { healthy: await c.healthCheck(), provider: "sigma" }; } },
];