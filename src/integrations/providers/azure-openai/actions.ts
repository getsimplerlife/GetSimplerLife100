import { createAzure_openaiClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const azure_openaiActions: ActionDefinition[] = [
  { name: "listAzure_openaiItems", description: "List azure-openai items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAzure_openaiClient(config); return c.listItems(); } },
  { name: "azure_openaiHealthCheck", description: "Check azure-openai connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAzure_openaiClient(config); return { healthy: await c.healthCheck(), provider: "azure-openai" }; } },
];
