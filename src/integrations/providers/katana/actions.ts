import { createKatanaClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const katanaActions: ActionDefinition[] = [
  { name: "listKatanaItems", description: "List katana items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createKatanaClient(config); return c.listItems(); } },
  { name: "katanaHealthCheck", description: "Check katana connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createKatanaClient(config); return { healthy: await c.healthCheck(), provider: "katana" }; } },
];
