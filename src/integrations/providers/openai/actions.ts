import { createOpenaiClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const openaiActions: ActionDefinition[] = [
  { name: "listOpenaiItems", description: "List openai items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOpenaiClient(config); return c.listItems(); } },
  { name: "openaiHealthCheck", description: "Check openai connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOpenaiClient(config); return { healthy: await c.healthCheck(), provider: "openai" }; } },
];
