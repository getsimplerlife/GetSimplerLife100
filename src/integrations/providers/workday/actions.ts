import { createWorkdayClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const workdayActions: ActionDefinition[] = [
  { name: "listWorkdayWorkers", description: "List Workday workers", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWorkdayClient(config); return c.listWorkers(); } },
  { name: "getWorkdayWorker", description: "Get Workday worker details", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, handler: async (config, params) => { const c = createWorkdayClient(config); return c.getWorker(params.id); } },
  { name: "workdayHealthCheck", description: "Check Workday connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWorkdayClient(config); return { healthy: await c.healthCheck(), provider: "workday" }; } },
];