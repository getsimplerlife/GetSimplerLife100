import { createPostgresqlClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const postgresqlActions: ActionDefinition[] = [
  { name: "postgresqlQuery", description: "Run query on postgresql", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createPostgresqlClient(config); return c.query(params.sql); } },
  { name: "postgresqlHealthCheck", description: "Check postgresql connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPostgresqlClient(config); return { healthy: await c.healthCheck(), provider: "postgresql" }; } },
];
