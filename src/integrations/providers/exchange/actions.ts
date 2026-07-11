import { createExchangeClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const exchangeActions: ActionDefinition[] = [
  { name: "listExchangeFolders", description: "List Exchange mail folders", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createExchangeClient(config); return c.listFolders(); } },
  { name: "listExchangeMessages", description: "List Exchange mail messages", inputSchema: { type: "object", properties: { folder: { type: "string" }, top: { type: "number" } } }, handler: async (config, params) => { const c = createExchangeClient(config); return c.listMessages(params.folder, params.top); } },
  { name: "sendExchangeMessage", description: "Send email via Exchange", inputSchema: { type: "object", properties: { message: { type: "object" } }, required: ["message"] }, handler: async (config, params) => { const c = createExchangeClient(config); return c.sendMessage(params.message); } },
  { name: "exchangeHealthCheck", description: "Check Exchange connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createExchangeClient(config); return { healthy: await c.healthCheck(), provider: "exchange" }; } },
];