import { createBCClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const bcActions: ActionDefinition[] = [
  { name: "searchBCCustomers", description: "Search Dynamics 365 BC customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createBCClient(config); return c.list("customers", params.filter); } },
  { name: "createBCSalesOrder", description: "Create BC sales order", inputSchema: { type: "object", properties: { customerId: { type: "string" }, orderDate: { type: "string" } }, required: ["customerId"] }, handler: async (config, params) => { const c = createBCClient(config); return c.create("salesOrders", params); } },
  { name: "createBCInvoice", description: "Create BC invoice", inputSchema: { type: "object", properties: { customerId: { type: "string" }, invoiceDate: { type: "string" } }, required: ["customerId"] }, handler: async (config, params) => { const c = createBCClient(config); return c.create("invoices", params); } },
  { name: "searchBCItems", description: "Search BC inventory items", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createBCClient(config); return c.list("items", params.filter); } },
  { name: "bcHealthCheck", description: "Check Dynamics BC connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBCClient(config); return { healthy: await c.healthCheck(), provider: "dynamics-365-bc" }; } },
];