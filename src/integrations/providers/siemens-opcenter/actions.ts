import { createSiemens_opcenterClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const siemens_opcenterActions: ActionDefinition[] = [
  { name: "listSiemens_opcenterItems", description: "List siemens-opcenter items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSiemens_opcenterClient(config); return c.listItems(); } },
  { name: "siemens_opcenterHealthCheck", description: "Check siemens-opcenter connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSiemens_opcenterClient(config); return { healthy: await c.healthCheck(), provider: "siemens-opcenter" }; } },
];
