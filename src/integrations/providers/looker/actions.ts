import { createLookerClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const lookerActions: ActionDefinition[] = [
  { name: "listLookerLooks", description: "List Looker looks", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createLookerClient(config); return c.listLooks(); } },
  { name: "listLookerDashboards", description: "List Looker dashboards", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createLookerClient(config); return c.listDashboards(); } },
  { name: "runLookerSql", description: "Run SQL query via Looker", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createLookerClient(config); return c.runSql(params.query); } },
  { name: "lookerHealthCheck", description: "Check Looker connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createLookerClient(config); return { healthy: await c.healthCheck(), provider: "looker" }; } },
];