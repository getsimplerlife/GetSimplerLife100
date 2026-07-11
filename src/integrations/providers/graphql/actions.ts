import { createGraphqlClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const graphqlActions: ActionDefinition[] = [
  { name: "graphqlQuery", description: "Run query on graphql", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createGraphqlClient(config); return c.query(params.sql); } },
  { name: "graphqlHealthCheck", description: "Check graphql connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGraphqlClient(config); return { healthy: await c.healthCheck(), provider: "graphql" }; } },
];
