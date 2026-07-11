import { createProject44Client } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const project44Actions: ActionDefinition[] = [
  { name: "listProject44Items", description: "List project44 items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createProject44Client(config); return c.listItems(); } },
  { name: "project44HealthCheck", description: "Check project44 connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createProject44Client(config); return { healthy: await c.healthCheck(), provider: "project44" }; } },
];
