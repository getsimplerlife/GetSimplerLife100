import { createOracleERPClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const oracleERPActions: ActionDefinition[] = [
  { name: "searchOracleCustomers", description: "Search Oracle ERP customers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createOracleERPClient(config); return c.list("customers", params.filter); } },
  { name: "searchOracleSuppliers", description: "Search Oracle ERP suppliers", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createOracleERPClient(config); return c.list("suppliers", params.filter); } },
  { name: "createOraclePurchaseOrder", description: "Create Oracle ERP purchase order", inputSchema: { type: "object", properties: { SupplierId: { type: "number" }, OrderDate: { type: "string" } }, required: ["SupplierId"] }, handler: async (config, params) => { const c = createOracleERPClient(config); return c.create("purchaseOrders", params); } },
  { name: "oracleERPHealthCheck", description: "Check Oracle ERP connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createOracleERPClient(config); return { healthy: await c.healthCheck(), provider: "oracle-erp-cloud" }; } },
];