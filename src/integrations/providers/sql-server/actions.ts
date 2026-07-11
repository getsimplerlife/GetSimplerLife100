import { createSql_serverClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const sql_serverActions: ActionDefinition[] = [
  { name: "sql_serverQuery", description: "Run query on sql-server", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createSql_serverClient(config); return c.query(params.sql); } },
  { name: "sql_serverHealthCheck", description: "Check sql-server connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSql_serverClient(config); return { healthy: await c.healthCheck(), provider: "sql-server" }; } },
];
