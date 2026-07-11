import { createMetabaseClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const metabaseActions: ActionDefinition[] = [
  { name: "listMetabaseQuestions", description: "List Metabase questions/cards", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMetabaseClient(config); return c.listQuestions(); } },
  { name: "runMetabaseQuery", description: "Run Metabase query", inputSchema: { type: "object", properties: { database: { type: "number" }, type: { type: "string" }, query: { type: "object" } }, required: ["database", "query"] }, handler: async (config, params) => { const c = createMetabaseClient(config); return c.runQuery(params); } },
  { name: "metabaseHealthCheck", description: "Check Metabase connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMetabaseClient(config); return { healthy: await c.healthCheck(), provider: "metabase" }; } },
];