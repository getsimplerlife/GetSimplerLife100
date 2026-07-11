import { createFishbowlClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const fishbowlActions: ActionDefinition[] = [
  { name: "listFishbowlItems", description: "List fishbowl items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFishbowlClient(config); return c.listItems(); } },
  { name: "fishbowlHealthCheck", description: "Check fishbowl connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFishbowlClient(config); return { healthy: await c.healthCheck(), provider: "fishbowl" }; } },
];
