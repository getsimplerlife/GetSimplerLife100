import { createSage50Client } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const sage50Actions: ActionDefinition[] = [
  { name: "searchSage50Customers", description: "Search Sage 50 customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createSage50Client(config); return c.list("Customer", params.filter); } },
  { name: "createSage50Customer", description: "Create Sage 50 customer", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } }, required: ["name"] }, handler: async (config, params) => { const c = createSage50Client(config); return c.create("Customer", params); } },
  { name: "sage50HealthCheck", description: "Check Sage 50 connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSage50Client(config); return { healthy: await c.healthCheck(), provider: "sage-50" }; } },
];