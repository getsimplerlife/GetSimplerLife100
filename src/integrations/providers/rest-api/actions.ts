import { createRest_apiClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const rest_apiActions: ActionDefinition[] = [
  { name: "rest_apiQuery", description: "Run query on rest-api", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createRest_apiClient(config); return c.query(params.sql); } },
  { name: "rest_apiHealthCheck", description: "Check rest-api connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createRest_apiClient(config); return { healthy: await c.healthCheck(), provider: "rest-api" }; } },
];
