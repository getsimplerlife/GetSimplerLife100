import { createAuthorize_netClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const authorize_netActions: ActionDefinition[] = [
  { name: "listAuthorize_netItems", description: "List authorize-net items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAuthorize_netClient(config); return c.listItems(); } },
  { name: "authorize_netHealthCheck", description: "Check authorize-net connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAuthorize_netClient(config); return { healthy: await c.healthCheck(), provider: "authorize-net" }; } },
];
