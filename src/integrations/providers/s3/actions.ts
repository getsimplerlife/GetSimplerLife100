import { createS3Client } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const s3Actions: ActionDefinition[] = [
  { name: "listS3Items", description: "List s3 items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createS3Client(config); return c.listItems(); } },
  { name: "s3HealthCheck", description: "Check s3 connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createS3Client(config); return { healthy: await c.healthCheck(), provider: "s3" }; } },
];
