import { createMicrosoft_bookingsClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const microsoft_bookingsActions: ActionDefinition[] = [
  { name: "listMicrosoft_bookingsItems", description: "List microsoft-bookings items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMicrosoft_bookingsClient(config); return c.listItems(); } },
  { name: "microsoft_bookingsHealthCheck", description: "Check microsoft-bookings connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMicrosoft_bookingsClient(config); return { healthy: await c.healthCheck(), provider: "microsoft-bookings" }; } },
];
