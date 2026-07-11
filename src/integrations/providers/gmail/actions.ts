import { createGmailClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const gmailActions: ActionDefinition[] = [
  { name: "listGmailMessages", description: "List Gmail messages", inputSchema: { type: "object", properties: { query: { type: "string" }, maxResults: { type: "number" } } }, handler: async (config, params) => { const c = createGmailClient(config); return c.listMessages(params.query, params.maxResults); } },
  { name: "sendGmailMessage", description: "Send email via Gmail", inputSchema: { type: "object", properties: { raw: { type: "string" } }, required: ["raw"] }, handler: async (config, params) => { const c = createGmailClient(config); return c.sendMessage(params.raw); } },
  { name: "getGmailMessage", description: "Get full Gmail message", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, handler: async (config, params) => { const c = createGmailClient(config); return c.getMessageFull(params.id); } },
  { name: "listGmailLabels", description: "List Gmail labels", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGmailClient(config); return c.listLabels(); } },
  { name: "gmailHealthCheck", description: "Check Gmail connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGmailClient(config); return { healthy: await c.healthCheck(), provider: "gmail" }; } },
];