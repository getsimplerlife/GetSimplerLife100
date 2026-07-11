import { createMistralClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const mistralActions: ActionDefinition[] = [
  { name: "listMistralItems", description: "List mistral items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMistralClient(config); return c.listItems(); } },
  { name: "mistralHealthCheck", description: "Check mistral connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMistralClient(config); return { healthy: await c.healthCheck(), provider: "mistral" }; } },
];
