import { createQBEClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const qbeActions: ActionDefinition[] = [
  { name: "queryQBE", description: "Run QuickBooks Enterprise query", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createQBEClient(config); return c.query(params.query); } },
  { name: "createQBECustomer", description: "Create QBE customer", inputSchema: { type: "object", properties: { DisplayName: { type: "string" }, PrimaryEmailAddr: { type: "object" } }, required: ["DisplayName"] }, handler: async (config, params) => { const c = createQBEClient(config); return c.create("customer", params); } },
  { name: "createQBEInvoice", description: "Create QBE invoice", inputSchema: { type: "object", properties: { CustomerRef: { type: "object" }, Line: { type: "array" } }, required: ["CustomerRef"] }, handler: async (config, params) => { const c = createQBEClient(config); return c.create("invoice", params); } },
  { name: "qbeHealthCheck", description: "Check QBE connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createQBEClient(config); return { healthy: await c.healthCheck(), provider: "quickbooks-enterprise" }; } },
];