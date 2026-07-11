import { createAws_bedrockClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const aws_bedrockActions: ActionDefinition[] = [
  { name: "listAws_bedrockItems", description: "List aws-bedrock items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAws_bedrockClient(config); return c.listItems(); } },
  { name: "aws_bedrockHealthCheck", description: "Check aws-bedrock connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAws_bedrockClient(config); return { healthy: await c.healthCheck(), provider: "aws-bedrock" }; } },
];
