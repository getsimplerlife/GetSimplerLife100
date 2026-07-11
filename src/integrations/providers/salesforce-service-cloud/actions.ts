import { createServiceCloudClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const serviceCloudActions: ActionDefinition[] = [
  { name: "querySCCases", description: "Query Salesforce Service Cloud cases", inputSchema: { type: "object", properties: { where: { type: "string" } } }, handler: async (config, params) => { const c = createServiceCloudClient(config); return c.queryCases(params.where); } },
  { name: "createSCCase", description: "Create Salesforce Service Cloud case", inputSchema: { type: "object", properties: { Subject: { type: "string" }, Status: { type: "string" }, Priority: { type: "string" }, Origin: { type: "string" }, Description: { type: "string" } }, required: ["Subject"] }, handler: async (config, params) => { const c = createServiceCloudClient(config); return c.createCase(params); } },
  { name: "serviceCloudHealthCheck", description: "Check Service Cloud connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createServiceCloudClient(config); return { healthy: await c.healthCheck(), provider: "salesforce-service-cloud" }; } },
];