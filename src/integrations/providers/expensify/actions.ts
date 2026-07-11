import { createExpensifyClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const expensifyActions: ActionDefinition[] = [
  { name: "listExpensifyReports", description: "List Expensify reports", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createExpensifyClient(config); return c.listReports(params.filter); } },
  { name: "createExpensifyExpense", description: "Create Expensify expense", inputSchema: { type: "object", properties: { amount: { type: "number" }, currency: { type: "string" }, merchant: { type: "string" }, date: { type: "string" } }, required: ["amount"] }, handler: async (config, params) => { const c = createExpensifyClient(config); return c.createExpense(params); } },
  { name: "expensifyHealthCheck", description: "Check Expensify connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createExpensifyClient(config); return { healthy: await c.healthCheck(), provider: "expensify" }; } },
];