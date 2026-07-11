import { createGcsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const gcsActions: ActionDefinition[] = [
  { name: "listGcsItems", description: "List gcs items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGcsClient(config); return c.listItems(); } },
  { name: "gcsHealthCheck", description: "Check gcs connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGcsClient(config); return { healthy: await c.healthCheck(), provider: "gcs" }; } },
];
