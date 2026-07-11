import { createHSClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const dropboxSignActions: ActionDefinition[] = [
  { name: "listDBSignRequests", description: "List Dropbox Sign requests", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createHSClient(config); return c.listSignatureRequests(); } },
  { name: "sendDBSignRequest", description: "Send Dropbox Sign request", inputSchema: { type: "object", properties: { title: { type: "string" }, subject: { type: "string" }, signers: { type: "array" }, files: { type: "array" } }, required: ["title", "signers"] }, handler: async (config, params) => { const c = createHSClient(config); return c.sendSignatureRequest(params); } },
  { name: "dbSignHealthCheck", description: "Check Dropbox Sign connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createHSClient(config); return { healthy: await c.healthCheck(), provider: "dropbox-sign" }; } },
];