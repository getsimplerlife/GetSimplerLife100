import { createBillClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const billActions: ActionDefinition[] = [
  { name: "searchBillVendors", description: "Search Bill.com vendors", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createBillClient(config); return c.list("Vendor", params.filter); } },
  { name: "createBillInvoice", description: "Create Bill.com invoice", inputSchema: { type: "object", properties: { vendorId: { type: "string" }, invoiceDate: { type: "string" }, amount: { type: "number" } }, required: ["vendorId", "amount"] }, handler: async (config, params) => { const c = createBillClient(config); return c.create("Invoice", params); } },
  { name: "billHealthCheck", description: "Check Bill.com connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBillClient(config); return { healthy: await c.healthCheck(), provider: "bill" }; } },
];