import { createOracle_dbClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const oracle_dbActions: ActionDefinition[] = [
  { name: "oracle_dbQuery", description: "Run query on oracle-db", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createOracle_dbClient(config); return c.query(params.sql); } },
  { name: "oracle_dbHealthCheck", description: "Check oracle-db connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOracle_dbClient(config); return { healthy: await c.healthCheck(), provider: "oracle-db" }; } },
];
