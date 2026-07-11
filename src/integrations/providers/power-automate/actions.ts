import { createPower_automateClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const power_automateActions: ActionDefinition[] = [
  { name: "listPower_automateItems", description: "List power-automate items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPower_automateClient(config); return c.listItems(); } },
  { name: "power_automateHealthCheck", description: "Check power-automate connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPower_automateClient(config); return { healthy: await c.healthCheck(), provider: "power-automate" }; } },
];
