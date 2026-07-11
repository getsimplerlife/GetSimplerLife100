import { createTypeformClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const typeformActions: ActionDefinition[] = [
  { name: "listTypeformItems", description: "List typeform items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTypeformClient(config); return c.listItems(); } },
  { name: "typeformHealthCheck", description: "Check typeform connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTypeformClient(config); return { healthy: await c.healthCheck(), provider: "typeform" }; } },
];
