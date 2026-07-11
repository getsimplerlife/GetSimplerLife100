import { createBambooHRClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const bamboohrActions: ActionDefinition[] = [
  { name: "listBambooHREmployees", description: "List BambooHR employees", inputSchema: { type: "object", properties: { limit: { type: "number" } } }, handler: async (config, params) => { const c = createBambooHRClient(config); return c.listEmployees(params.limit); } },
  { name: "getBambooHREmployee", description: "Get BambooHR employee details", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, handler: async (config, params) => { const c = createBambooHRClient(config); return c.getEmployee(params.id); } },
  { name: "bamboohrHealthCheck", description: "Check BambooHR connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBambooHRClient(config); return { healthy: await c.healthCheck(), provider: "bamboohr" }; } },
];