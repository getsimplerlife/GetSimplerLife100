import { createGoogle_calendarClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const google_calendarActions: ActionDefinition[] = [
  { name: "listGoogle_calendarItems", description: "List google-calendar items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_calendarClient(config); return c.listItems(); } },
  { name: "google_calendarHealthCheck", description: "Check google-calendar connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGoogle_calendarClient(config); return { healthy: await c.healthCheck(), provider: "google-calendar" }; } },
];
