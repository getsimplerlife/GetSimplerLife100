import { createMicrosoft_formsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const microsoft_formsActions: ActionDefinition[] = [
  { name: "listMicrosoft_formsItems", description: "List microsoft-forms items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMicrosoft_formsClient(config); return c.listItems(); } },
  { name: "microsoft_formsHealthCheck", description: "Check microsoft-forms connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMicrosoft_formsClient(config); return { healthy: await c.healthCheck(), provider: "microsoft-forms" }; } },
];
