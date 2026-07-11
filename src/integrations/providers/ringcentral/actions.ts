import { createRCClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const ringCentralActions: ActionDefinition[] = [
  { name: "listRCCallLogs", description: "List RingCentral call logs", inputSchema: { type: "object", properties: { dateFrom: { type: "string" }, dateTo: { type: "string" } } }, handler: async (config, params) => { const c = createRCClient(config); return c.listCallLogs(params.dateFrom, params.dateTo); } },
  { name: "sendRCSMS", description: "Send RingCentral SMS", inputSchema: { type: "object", properties: { to: { type: "string" }, text: { type: "string" } }, required: ["to", "text"] }, handler: async (config, params) => { const c = createRCClient(config); return c.sendSMS(params.to, params.text); } },
  { name: "rcHealthCheck", description: "Check RingCentral connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createRCClient(config); return { healthy: await c.healthCheck(), provider: "ringcentral" }; } },
];