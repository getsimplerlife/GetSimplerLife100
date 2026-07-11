import { createTruckstopClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const truckstopActions: ActionDefinition[] = [
  { name: "listTruckstopItems", description: "List truckstop items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTruckstopClient(config); return c.listItems(); } },
  { name: "truckstopHealthCheck", description: "Check truckstop connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTruckstopClient(config); return { healthy: await c.healthCheck(), provider: "truckstop" }; } },
];
