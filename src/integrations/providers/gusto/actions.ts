import { createGustoClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const gustoActions: ActionDefinition[] = [
  { name: "listGustoCompanies", description: "List Gusto companies", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGustoClient(config); return c.listCompanies(); } },
  { name: "listGustoEmployees", description: "List Gusto employees", inputSchema: { type: "object", properties: { companyId: { type: "string" } }, required: ["companyId"] }, handler: async (config, params) => { const c = createGustoClient(config); return c.listEmployees(params.companyId); } },
  { name: "gustoHealthCheck", description: "Check Gusto connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGustoClient(config); return { healthy: await c.healthCheck(), provider: "gusto" }; } },
];