import { createShopifyClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

export const shopifyActions: ActionDefinition[] = [
  // ── understand (read) ──
  {
    name: "listShopifyProducts",
    description: "List Shopify products",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.listProducts(params as any); },
  },
  {
    name: "getShopifyProduct",
    description: "Get a single Shopify product",
    inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.getProduct((params as any).id); },
  },
  {
    name: "listShopifyOrders",
    description: "List Shopify orders",
    inputSchema: { type: "object", properties: { status: { type: "string" }, limit: { type: "number" } } },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.listOrders(params as any); },
  },
  {
    name: "getShopifyOrder",
    description: "Get a single Shopify order",
    inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.getOrder((params as any).id); },
  },
  {
    name: "listShopifyCustomers",
    description: "List Shopify customers",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.listCustomers(params as any); },
  },
  {
    name: "listShopifyInventoryLevels",
    description: "List Shopify inventory levels",
    inputSchema: { type: "object", properties: { locationId: { type: "number" }, inventoryItemIds: { type: "array", items: { type: "number" } } } },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.listInventoryLevels(params as any); },
  },
  {
    name: "listShopifyFulfillments",
    description: "List fulfillments for an order",
    inputSchema: { type: "object", properties: { orderId: { type: "number" } }, required: ["orderId"] },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.listFulfillments((params as any).orderId); },
  },
  // ── automate (write) ──
  {
    name: "createShopifyProduct",
    description: "Create a Shopify product",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" }, body_html: { type: "string" }, vendor: { type: "string" }, product_type: { type: "string" }, variants: { type: "array" } },
      required: ["title"],
    },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.createProduct(params as any); },
  },
  {
    name: "updateShopifyProduct",
    description: "Update a Shopify product",
    inputSchema: { type: "object", properties: { id: { type: "number" }, title: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.updateProduct((params as any).id, params as any); },
  },
  {
    name: "deleteShopifyProduct",
    description: "Delete a Shopify product",
    inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.deleteProduct((params as any).id); },
  },
  {
    name: "createShopifyFulfillment",
    description: "Create a fulfillment for an order",
    inputSchema: { type: "object", properties: { orderId: { type: "number" }, locationId: { type: "number" }, trackingNumber: { type: "string" } }, required: ["orderId"] },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.createFulfillment((params as any).orderId, params as any); },
  },
  {
    name: "updateShopifyFulfillment",
    description: "Update a fulfillment",
    inputSchema: { type: "object", properties: { orderId: { type: "number" }, fulfillmentId: { type: "number" } }, required: ["orderId", "fulfillmentId"] },
    handler: async (config, params) => { const c = createShopifyClient(config); return c.updateFulfillment((params as any).orderId, (params as any).fulfillmentId, params as any); },
  },
  // ── health ──
  {
    name: "shopifyHealthCheck",
    description: "Check Shopify connection health",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => { const c = createShopifyClient(config); return { healthy: await c.healthCheck(), provider: "shopify" }; },
  },
];
