import { createWebhooks_broadClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const webhooks_broadActions: ActionDefinition[] = [
  { name: "webhooks_broadQuery", description: "Run query on webhooks-broad", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createWebhooks_broadClient(config); return c.query(params.sql); } },
  { name: "webhooks_broadHealthCheck", description: "Check webhooks-broad connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWebhooks_broadClient(config); return { healthy: await c.healthCheck(), provider: "webhooks-broad" }; } },
];
