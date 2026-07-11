import { createSageX3Client } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const sageX3Actions: ActionDefinition[] = [
  { name: "searchSageX3BP", description: "Search Sage X3 business partners", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createSageX3Client(config); return c.list("BP", params.filter); } },
  { name: "createSageX3SalesOrder", description: "Create Sage X3 sales order", inputSchema: { type: "object", properties: { BPCORD: { type: "string" }, ORDDAT: { type: "string" } }, required: ["BPCORD"] }, handler: async (config, params) => { const c = createSageX3Client(config); return c.create("SORDER", params); } },
  { name: "sageX3HealthCheck", description: "Check Sage X3 connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSageX3Client(config); return { healthy: await c.healthCheck(), provider: "sage-x3" }; } },
];