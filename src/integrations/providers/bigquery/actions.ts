import { createBigqueryClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const bigqueryActions: ActionDefinition[] = [
  { name: "bigqueryQuery", description: "Run query on bigquery", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createBigqueryClient(config); return c.query(params.sql); } },
  { name: "bigqueryHealthCheck", description: "Check bigquery connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBigqueryClient(config); return { healthy: await c.healthCheck(), provider: "bigquery" }; } },
];
