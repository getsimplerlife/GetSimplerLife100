import { createDescartesClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const descartesActions: ActionDefinition[] = [
  { name: "listDescartesItems", description: "List descartes items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDescartesClient(config); return c.listItems(); } },
  { name: "descartesHealthCheck", description: "Check descartes connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDescartesClient(config); return { healthy: await c.healthCheck(), provider: "descartes" }; } },
];
