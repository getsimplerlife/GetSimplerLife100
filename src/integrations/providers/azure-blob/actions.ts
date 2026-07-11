import { createAzure_blobClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const azure_blobActions: ActionDefinition[] = [
  { name: "listAzure_blobItems", description: "List azure-blob items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAzure_blobClient(config); return c.listItems(); } },
  { name: "azure_blobHealthCheck", description: "Check azure-blob connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAzure_blobClient(config); return { healthy: await c.healthCheck(), provider: "azure-blob" }; } },
];
