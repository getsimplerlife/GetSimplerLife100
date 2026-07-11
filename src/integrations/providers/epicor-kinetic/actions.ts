import { createKineticClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const kineticActions: ActionDefinition[] = [
  { name: "searchKineticCustomers", description: "Search Kinetic customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createKineticClient(config); return c.list("Customer", params.filter); } },
  { name: "createKineticSalesOrder", description: "Create Kinetic sales order", inputSchema: { type: "object", properties: { CustomerNum: { type: "number" }, OrderDate: { type: "string" } }, required: ["CustomerNum"] }, handler: async (config, params) => { const c = createKineticClient(config); return c.create("SalesOrder", params); } },
  { name: "kineticHealthCheck", description: "Check Kinetic connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createKineticClient(config); return { healthy: await c.healthCheck(), provider: "epicor-kinetic" }; } },
];