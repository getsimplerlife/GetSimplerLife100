import { createPBIClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const powerBIActions: ActionDefinition[] = [
  { name: "listPowerBIDatasets", description: "List Power BI datasets", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPBIClient(config); return c.listDatasets(); } },
  { name: "listPowerBIReports", description: "List Power BI reports", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPBIClient(config); return c.listReports(); } },
  { name: "refreshPowerBIDataset", description: "Refresh Power BI dataset", inputSchema: { type: "object", properties: { datasetId: { type: "string" } }, required: ["datasetId"] }, handler: async (config, params) => { const c = createPBIClient(config); return c.refreshDataset(params.datasetId); } },
  { name: "powerBIHealthCheck", description: "Check Power BI connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createPBIClient(config); return { healthy: await c.healthCheck(), provider: "power-bi" }; } },
];