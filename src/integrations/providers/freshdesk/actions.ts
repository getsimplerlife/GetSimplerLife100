import { createFreshdeskClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const freshdeskActions: ActionDefinition[] = [
  { name: "listFreshdeskTickets", description: "List Freshdesk tickets", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFreshdeskClient(config); return c.listTickets(); } },
  { name: "createFreshdeskTicket", description: "Create Freshdesk ticket", inputSchema: { type: "object", properties: { subject: { type: "string" }, description: { type: "string" }, email: { type: "string" }, priority: { type: "number" } }, required: ["subject"] }, handler: async (config, params) => { const c = createFreshdeskClient(config); return c.createTicket(params); } },
  { name: "freshdeskHealthCheck", description: "Check Freshdesk connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFreshdeskClient(config); return { healthy: await c.healthCheck(), provider: "freshdesk" }; } },
];