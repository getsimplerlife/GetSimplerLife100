import { createEpicorClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const epicorActions: ActionDefinition[] = [
  { name: "searchEpicorCustomers", description: "Search Epicor customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createEpicorClient(config); return c.list("Customer", params.filter); } },
  { name: "createEpicorSalesOrder", description: "Create Epicor sales order", inputSchema: { type: "object", properties: { OrderDate: { type: "string" }, CustomerNum: { type: "number" } }, required: ["CustomerNum"] }, handler: async (config, params) => { const c = createEpicorClient(config); return c.create("SalesOrder", params); } },
  { name: "searchEpicorParts", description: "Search Epicor parts/inventory", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createEpicorClient(config); return c.list("Part", params.filter); } },
  { name: "runEpicorBAQ", description: "Run Epicor BAQ query", inputSchema: { type: "object", properties: { baqId: { type: "string" } }, required: ["baqId"] }, handler: async (config, params) => { const c = createEpicorClient(config); return c.runBAQ(params.baqId, params.parameters); } },
  { name: "epicorHealthCheck", description: "Check Epicor connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEpicorClient(config); return { healthy: await c.healthCheck(), provider: "epicor" }; } },
];