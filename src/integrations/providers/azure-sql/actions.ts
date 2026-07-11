import { createAzure_sqlClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const azure_sqlActions: ActionDefinition[] = [
  { name: "azure_sqlQuery", description: "Run query on azure-sql", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createAzure_sqlClient(config); return c.query(params.sql); } },
  { name: "azure_sqlHealthCheck", description: "Check azure-sql connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAzure_sqlClient(config); return { healthy: await c.healthCheck(), provider: "azure-sql" }; } },
];
