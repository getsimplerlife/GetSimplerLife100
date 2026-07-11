import { createBigCommerceClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const bigCommerceActions: ActionDefinition[] = [
  { name: "listBigCommerceProducts", description: "List BigCommerce products", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBigCommerceClient(config); return c.listProducts(); } },
  { name: "createBigCommerceProduct", description: "Create BigCommerce product", inputSchema: { type: "object", properties: { name: { type: "string" }, price: { type: "number" }, type: { type: "string" }, weight: { type: "number" } }, required: ["name", "price"] }, handler: async (config, params) => { const c = createBigCommerceClient(config); return c.createProduct(params); } },
  { name: "bigCommerceHealthCheck", description: "Check BigCommerce connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBigCommerceClient(config); return { healthy: await c.healthCheck(), provider: "bigcommerce" }; } },
];