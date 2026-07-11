import { createSPApiClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const amazonSellerActions: ActionDefinition[] = [
  { name: "listAmazonOrders", description: "List Amazon seller orders (SP-API)", inputSchema: { type: "object", properties: { createdAfter: { type: "string" } }, required: ["createdAfter"] }, handler: async (config, params) => { const c = createSPApiClient(config); return c.listOrders(params.createdAfter); } },
  { name: "getAmazonCatalogItem", description: "Get Amazon catalog item by ASIN", inputSchema: { type: "object", properties: { asin: { type: "string" } }, required: ["asin"] }, handler: async (config, params) => { const c = createSPApiClient(config); return c.getCatalogItem(params.asin); } },
  { name: "amazonSellerHealthCheck", description: "Check Amazon SP-API connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSPApiClient(config); return { healthy: await c.healthCheck(), provider: "amazon-seller" }; } },
];