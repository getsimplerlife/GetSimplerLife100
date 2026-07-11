import { createCalendlyClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const calendlyActions: ActionDefinition[] = [
  { name: "listCalendlyItems", description: "List calendly items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createCalendlyClient(config); return c.listItems(); } },
  { name: "calendlyHealthCheck", description: "Check calendly connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createCalendlyClient(config); return { healthy: await c.healthCheck(), provider: "calendly" }; } },
];
