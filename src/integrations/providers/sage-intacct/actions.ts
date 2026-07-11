import { createIntacctClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const intacctActions: ActionDefinition[] = [
  { name: "searchIntacctCustomers", description: "Search Sage Intacct customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createIntacctClient(config); return c.list("customers", params.filter); } },
  { name: "searchIntacctVendors", description: "Search Sage Intacct vendors", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createIntacctClient(config); return c.list("vendors", params.filter); } },
  { name: "createIntacctInvoice", description: "Create Sage Intacct invoice", inputSchema: { type: "object", properties: { customerId: { type: "string" }, transactionDate: { type: "string" }, grossAmount: { type: "number" } }, required: ["customerId", "grossAmount"] }, handler: async (config, params) => { const c = createIntacctClient(config); return c.create("invoices", params); } },
  { name: "intacctHealthCheck", description: "Check Sage Intacct connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIntacctClient(config); return { healthy: await c.healthCheck(), provider: "sage-intacct" }; } },
];