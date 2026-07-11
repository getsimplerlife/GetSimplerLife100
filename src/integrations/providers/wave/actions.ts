import { createWaveClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const waveActions: ActionDefinition[] = [
  { name: "waveQuery", description: "Run Wave GraphQL query", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createWaveClient(config); return c.query(params.query); } },
  { name: "waveHealthCheck", description: "Check Wave connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWaveClient(config); return { healthy: await c.healthCheck(), provider: "wave" }; } },
];