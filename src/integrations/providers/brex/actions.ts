import { createBrexClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const brexActions: ActionDefinition[] = [
  { name: "listBrexTransactions", description: "List Brex transactions", inputSchema: { type: "object", properties: { filter: { type: "string" } } }, handler: async (config, params) => { const c = createBrexClient(config); return c.listTransactions(params.filter); } },
  { name: "listBrexAccounts", description: "List Brex accounts", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBrexClient(config); return c.listAccounts(); } },
  { name: "listBrexCards", description: "List Brex cards", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBrexClient(config); return c.listCards(); } },
  { name: "brexHealthCheck", description: "Check Brex connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBrexClient(config); return { healthy: await c.healthCheck(), provider: "brex" }; } },
];