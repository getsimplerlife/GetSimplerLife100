import { createShopifyClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const shopifyActions: ActionDefinition[] = [
  { name: "listShopifyProducts", description: "List Shopify products", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createShopifyClient(config); return c.listProducts(); } },
  { name: "createShopifyProduct", description: "Create Shopify product", inputSchema: { type: "object", properties: { title: { type: "string" }, body_html: { type: "string" }, vendor: { type: "string" }, product_type: { type: "string" }, variants: { type: "array" } }, required: ["title"] }, handler: async (config, params) => { const c = createShopifyClient(config); return c.createProduct(params); } },
  { name: "listShopifyOrders", description: "List Shopify orders", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createShopifyClient(config); return c.listOrders(); } },
  { name: "shopifyHealthCheck", description: "Check Shopify connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createShopifyClient(config); return { healthy: await c.healthCheck(), provider: "shopify" }; } },
];