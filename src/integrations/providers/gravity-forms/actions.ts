import { createGravity_formsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const gravity_formsActions: ActionDefinition[] = [
  { name: "listGravity_formsItems", description: "List gravity-forms items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGravity_formsClient(config); return c.listItems(); } },
  { name: "gravity_formsHealthCheck", description: "Check gravity-forms connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGravity_formsClient(config); return { healthy: await c.healthCheck(), provider: "gravity-forms" }; } },
];
