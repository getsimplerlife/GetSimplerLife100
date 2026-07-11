import { createInforClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const inforActions: ActionDefinition[] = [
  { name: "searchInforCustomers", description: "Search Infor M3 customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createInforClient(config); return c.list("CRS610", "MthName", params.filter); } },
  { name: "executeInforTransaction", description: "Execute Infor M3 transaction", inputSchema: { type: "object", properties: { program: { type: "string" }, transaction: { type: "string" }, data: { type: "object" } }, required: ["program", "transaction"] }, handler: async (config, params) => { const c = createInforClient(config); return c.execute(params.program, params.transaction, params.data); } },
  { name: "inforHealthCheck", description: "Check Infor connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createInforClient(config); return { healthy: await c.healthCheck(), provider: "infor-cloudsuite" }; } },
];