import { createAuth0Client } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const auth0Actions: ActionDefinition[] = [
  { name: "listAuth0Items", description: "List auth0 items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAuth0Client(config); return c.listItems(); } },
  { name: "auth0HealthCheck", description: "Check auth0 connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAuth0Client(config); return { healthy: await c.healthCheck(), provider: "auth0" }; } },
];
