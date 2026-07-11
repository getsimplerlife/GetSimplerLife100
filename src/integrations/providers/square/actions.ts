import { createSquareClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const squareActions: ActionDefinition[] = [
  { name: "listSquareItems", description: "List square items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSquareClient(config); return c.listItems(); } },
  { name: "squareHealthCheck", description: "Check square connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSquareClient(config); return { healthy: await c.healthCheck(), provider: "square" }; } },
];
