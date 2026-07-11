import { createXeroClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const xeroActions: ActionDefinition[] = [
  { name: "searchXeroContacts", description: "Search Xero contacts", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createXeroClient(config); return c.list("Contacts", params.filter); } },
  { name: "createXeroInvoice", description: "Create Xero invoice", inputSchema: { type: "object", properties: { Type: { type: "string", enum: ["ACCREC", "ACCPAY"] }, Contact: { type: "object" }, LineItems: { type: "array" }, Date: { type: "string" } }, required: ["Type", "Contact"] }, handler: async (config, params) => { const c = createXeroClient(config); return c.create("Invoices", params); } },
  { name: "createXeroContact", description: "Create Xero contact", inputSchema: { type: "object", properties: { Name: { type: "string" }, EmailAddress: { type: "string" } }, required: ["Name"] }, handler: async (config, params) => { const c = createXeroClient(config); return c.create("Contacts", params); } },
  { name: "xeroHealthCheck", description: "Check Xero connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createXeroClient(config); return { healthy: await c.healthCheck(), provider: "xero" }; } },
];