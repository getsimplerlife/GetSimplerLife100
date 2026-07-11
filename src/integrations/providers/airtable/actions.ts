import { createAirtableClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const airtableActions: ActionDefinition[] = [
  { name: "airtableQuery", description: "Run query on airtable", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createAirtableClient(config); return c.query(params.sql); } },
  { name: "airtableHealthCheck", description: "Check airtable connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAirtableClient(config); return { healthy: await c.healthCheck(), provider: "airtable" }; } },
];
