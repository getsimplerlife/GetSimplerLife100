import { createPaypalClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const paypalActions: ActionDefinition[] = [
  { name: "listPaypalItems", description: "List paypal items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPaypalClient(config); return c.listItems(); } },
  { name: "paypalHealthCheck", description: "Check paypal connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPaypalClient(config); return { healthy: await c.healthCheck(), provider: "paypal" }; } },
];
