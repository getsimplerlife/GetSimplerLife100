import { createJsonClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const jsonActions: ActionDefinition[] = [
  { name: "jsonQuery", description: "Run query on json", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createJsonClient(config); return c.query(params.sql); } },
  { name: "jsonHealthCheck", description: "Check json connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createJsonClient(config); return { healthy: await c.healthCheck(), provider: "json" }; } },
];
