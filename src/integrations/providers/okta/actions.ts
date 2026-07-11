import { createOktaClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const oktaActions: ActionDefinition[] = [
  { name: "listOktaItems", description: "List okta items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOktaClient(config); return c.listItems(); } },
  { name: "oktaHealthCheck", description: "Check okta connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOktaClient(config); return { healthy: await c.healthCheck(), provider: "okta" }; } },
];
