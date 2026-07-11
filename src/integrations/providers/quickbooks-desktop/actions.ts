import { createQBDClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const qbdActions: ActionDefinition[] = [
  { name: "queryQBDCustomers", description: "Query QuickBooks Desktop customers", inputSchema: { type: "object", properties: { nameFilter: { type: "string" } } }, handler: async (config, params) => { const c = createQBDClient(config); return c.queryCustomers(params.nameFilter); } },
  { name: "addQBDCustomer", description: "Add QBD customer", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } }, required: ["name"] }, handler: async (config, params) => { const c = createQBDClient(config); return c.addCustomer(params.name, params.email); } },
  { name: "addQBDInvoice", description: "Add QBD invoice", inputSchema: { type: "object", properties: { customerRef: { type: "string" }, date: { type: "string" }, items: { type: "array" } }, required: ["customerRef", "date"] }, handler: async (config, params) => { const c = createQBDClient(config); return c.addInvoice(params.customerRef, params.date, params.items); } },
  { name: "qbdHealthCheck", description: "Check QBD connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createQBDClient(config); return { healthy: await c.healthCheck(), provider: "quickbooks-desktop" }; } },
];