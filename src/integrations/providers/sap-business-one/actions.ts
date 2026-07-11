import { createB1Client } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const b1Actions: ActionDefinition[] = [
  { name: "searchB1BusinessPartners", description: "Search SAP B1 business partners", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createB1Client(config); return c.list("BusinessPartners", params.filter); } },
  { name: "createB1SalesOrder", description: "Create SAP B1 sales order", inputSchema: { type: "object", properties: { CardCode: { type: "string" }, DocDate: { type: "string" }, DocDueDate: { type: "string" } }, required: ["CardCode"] }, handler: async (config, params) => { const c = createB1Client(config); return c.create("Orders", params); } },
  { name: "createB1Invoice", description: "Create SAP B1 A/R invoice", inputSchema: { type: "object", properties: { CardCode: { type: "string" }, DocDate: { type: "string" } }, required: ["CardCode"] }, handler: async (config, params) => { const c = createB1Client(config); return c.create("Invoices", params); } },
  { name: "b1HealthCheck", description: "Check SAP B1 connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createB1Client(config); return { healthy: await c.healthCheck(), provider: "sap-business-one" }; } },
];