import { createMysqlClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const mysqlActions: ActionDefinition[] = [
  { name: "mysqlQuery", description: "Run query on mysql", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createMysqlClient(config); return c.query(params.sql); } },
  { name: "mysqlHealthCheck", description: "Check mysql connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMysqlClient(config); return { healthy: await c.healthCheck(), provider: "mysql" }; } },
];
