import { createGoogle_geminiClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const google_geminiActions: ActionDefinition[] = [
  { name: "listGoogle_geminiItems", description: "List google-gemini items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_geminiClient(config); return c.listItems(); } },
  { name: "google_geminiHealthCheck", description: "Check google-gemini connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_geminiClient(config); return { healthy: await c.healthCheck(), provider: "google-gemini" }; } },
];
