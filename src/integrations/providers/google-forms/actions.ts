import { createGoogle_formsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const google_formsActions: ActionDefinition[] = [
  { name: "listGoogle_formsItems", description: "List google-forms items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_formsClient(config); return c.listItems(); } },
  { name: "google_formsHealthCheck", description: "Check google-forms connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_formsClient(config); return { healthy: await c.healthCheck(), provider: "google-forms" }; } },
];
