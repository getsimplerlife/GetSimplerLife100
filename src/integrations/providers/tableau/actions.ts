import { createTableauClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const tableauActions: ActionDefinition[] = [
  { name: "listTableauWorkbooks", description: "List Tableau workbooks", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTableauClient(config); return c.listWorkbooks(); } },
  { name: "listTableauDatasources", description: "List Tableau datasources", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTableauClient(config); return c.listDatasources(); } },
  { name: "tableauHealthCheck", description: "Check Tableau connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTableauClient(config); return { healthy: await c.healthCheck(), provider: "tableau" }; } },
];