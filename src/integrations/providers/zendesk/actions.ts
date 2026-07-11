import { createZendeskClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const zendeskActions: ActionDefinition[] = [
  { name: "listZendeskTickets", description: "List Zendesk tickets", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createZendeskClient(config); return c.listTickets(); } },
  { name: "createZendeskTicket", description: "Create Zendesk ticket", inputSchema: { type: "object", properties: { subject: { type: "string" }, comment: { type: "object" }, priority: { type: "string" } }, required: ["subject", "comment"] }, handler: async (config, params) => { const c = createZendeskClient(config); return c.createTicket(params); } },
  { name: "searchZendeskTickets", description: "Search Zendesk tickets", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createZendeskClient(config); return c.searchTickets(params.query); } },
  { name: "zendeskHealthCheck", description: "Check Zendesk connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createZendeskClient(config); return { healthy: await c.healthCheck(), provider: "zendesk" }; } },
];