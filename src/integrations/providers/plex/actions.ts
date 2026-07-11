import { createPlexClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const plexActions: ActionDefinition[] = [
  { name: "listPlexItems", description: "List plex items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPlexClient(config); return c.listItems(); } },
  { name: "plexHealthCheck", description: "Check plex connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPlexClient(config); return { healthy: await c.healthCheck(), provider: "plex" }; } },
];
