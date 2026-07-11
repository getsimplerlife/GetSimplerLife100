import { createOutlook_calendarClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const outlook_calendarActions: ActionDefinition[] = [
  { name: "listOutlook_calendarItems", description: "List outlook-calendar items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOutlook_calendarClient(config); return c.listItems(); } },
  { name: "outlook_calendarHealthCheck", description: "Check outlook-calendar connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOutlook_calendarClient(config); return { healthy: await c.healthCheck(), provider: "outlook-calendar" }; } },
];
