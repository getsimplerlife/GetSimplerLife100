import { createCohereClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const cohereActions: ActionDefinition[] = [
  { name: "listCohereItems", description: "List cohere items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createCohereClient(config); return c.listItems(); } },
  { name: "cohereHealthCheck", description: "Check cohere connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createCohereClient(config); return { healthy: await c.healthCheck(), provider: "cohere" }; } },
];
