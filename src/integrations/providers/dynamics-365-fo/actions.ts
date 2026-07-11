import { createFOClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const foActions: ActionDefinition[] = [
  { name: "searchFOCustomers", description: "Search D365 F&O customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createFOClient(config); return c.list("Customers", params.filter); } },
  { name: "searchFOVendors", description: "Search D365 F&O vendors", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createFOClient(config); return c.list("Vendors", params.filter); } },
  { name: "createFOPurchaseOrder", description: "Create D365 F&O purchase order", inputSchema: { type: "object", properties: { VendorAccount: { type: "string" }, PurchaseOrderNumber: { type: "string" }, OrderDate: { type: "string" } }, required: ["VendorAccount"] }, handler: async (config, params) => { const c = createFOClient(config); return c.create("PurchaseOrderHeadersV2", params); } },
  { name: "foHealthCheck", description: "Check D365 F&O connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFOClient(config); return { healthy: await c.healthCheck(), provider: "dynamics-365-fo" }; } },
];