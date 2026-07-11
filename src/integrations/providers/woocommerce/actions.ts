import { createWooClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const wooCommerceActions: ActionDefinition[] = [
  { name: "listWooProducts", description: "List WooCommerce products", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWooClient(config); return c.listProducts(); } },
  { name: "createWooProduct", description: "Create WooCommerce product", inputSchema: { type: "object", properties: { name: { type: "string" }, type: { type: "string" }, regular_price: { type: "string" }, description: { type: "string" } }, required: ["name", "regular_price"] }, handler: async (config, params) => { const c = createWooClient(config); return c.createProduct(params); } },
  { name: "listWooOrders", description: "List WooCommerce orders", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWooClient(config); return c.listOrders(); } },
  { name: "woocommerceHealthCheck", description: "Check WooCommerce connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWooClient(config); return { healthy: await c.healthCheck(), provider: "woocommerce" }; } },
];