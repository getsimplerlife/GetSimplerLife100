import { createQlikClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const qlikSenseActions: ActionDefinition[] = [
  { name: "listQlikApps", description: "List Qlik Sense apps", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createQlikClient(config); return c.listApps(); } },
  { name: "qlikSenseHealthCheck", description: "Check Qlik Sense connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createQlikClient(config); return { healthy: await c.healthCheck(), provider: "qlik-sense" }; } },
];