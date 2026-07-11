import { createAthenahealthClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const athenahealthActions: ActionDefinition[] = [
  { name: "listAthenahealthItems", description: "List athenahealth items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAthenahealthClient(config); return c.listItems(); } },
  { name: "athenahealthHealthCheck", description: "Check athenahealth connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAthenahealthClient(config); return { healthy: await c.healthCheck(), provider: "athenahealth" }; } },
];
