import { createFreshBooksClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const freshBooksActions: ActionDefinition[] = [
  { name: "searchFreshBooksClients", description: "Search FreshBooks clients", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createFreshBooksClient(config); return c.list("clients", params.filter); } },
  { name: "createFreshBooksInvoice", description: "Create FreshBooks invoice", inputSchema: { type: "object", properties: { customerid: { type: "number" }, create_date: { type: "string" } }, required: ["customerid"] }, handler: async (config, params) => { const c = createFreshBooksClient(config); return c.create("invoices", params); } },
  { name: "freshBooksHealthCheck", description: "Check FreshBooks connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFreshBooksClient(config); return { healthy: await c.healthCheck(), provider: "freshbooks" }; } },
];