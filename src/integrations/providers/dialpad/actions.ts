import { createDialpadClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const dialpadActions: ActionDefinition[] = [
  { name: "listDialpadCallLogs", description: "List Dialpad call logs", inputSchema: { type: "object", properties: { limit: { type: "number" } } }, handler: async (config, params) => { const c = createDialpadClient(config); return c.listCallLogs(params.limit); } },
  { name: "sendDialpadSMS", description: "Send SMS via Dialpad", inputSchema: { type: "object", properties: { to: { type: "string" }, text: { type: "string" } }, required: ["to", "text"] }, handler: async (config, params) => { const c = createDialpadClient(config); return c.sendSMS(params.to, params.text); } },
  { name: "listDialpadUsers", description: "List Dialpad users", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDialpadClient(config); return c.listUsers(); } },
  { name: "dialpadHealthCheck", description: "Check Dialpad connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDialpadClient(config); return { healthy: await c.healthCheck(), provider: "dialpad" }; } },
];