import { createTray_ioClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const tray_ioActions: ActionDefinition[] = [
  { name: "listTray_ioItems", description: "List tray-io items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTray_ioClient(config); return c.listItems(); } },
  { name: "tray_ioHealthCheck", description: "Check tray-io connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTray_ioClient(config); return { healthy: await c.healthCheck(), provider: "tray-io" }; } },
];
