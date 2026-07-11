import { createMongodbClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const mongodbActions: ActionDefinition[] = [
  { name: "mongodbQuery", description: "Run query on mongodb", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createMongodbClient(config); return c.query(params.sql); } },
  { name: "mongodbHealthCheck", description: "Check mongodb connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMongodbClient(config); return { healthy: await c.healthCheck(), provider: "mongodb" }; } },
];
