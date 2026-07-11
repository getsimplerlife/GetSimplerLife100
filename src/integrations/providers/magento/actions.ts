import { createMagentoClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const magentoActions: ActionDefinition[] = [
  { name: "listMagentoProducts", description: "List Magento products", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMagentoClient(config); return c.listProducts(); } },
  { name: "createMagentoProduct", description: "Create Magento product", inputSchema: { type: "object", properties: { sku: { type: "string" }, name: { type: "string" }, price: { type: "number" }, attribute_set_id: { type: "number" } }, required: ["sku", "name", "attribute_set_id"] }, handler: async (config, params) => { const c = createMagentoClient(config); return c.createProduct(params); } },
  { name: "magentoHealthCheck", description: "Check Magento connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMagentoClient(config); return { healthy: await c.healthCheck(), provider: "magento" }; } },
];