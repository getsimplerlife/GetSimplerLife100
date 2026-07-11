import { createSnowflakeClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const snowflakeActions: ActionDefinition[] = [
  { name: "snowflakeQuery", description: "Run query on snowflake", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createSnowflakeClient(config); return c.query(params.sql); } },
  { name: "snowflakeHealthCheck", description: "Check snowflake connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSnowflakeClient(config); return { healthy: await c.healthCheck(), provider: "snowflake" }; } },
];
