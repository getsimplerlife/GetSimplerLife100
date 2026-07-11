import { createWebexClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const webexActions: ActionDefinition[] = [
  { name: "listWebexRooms", description: "List Webex rooms", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWebexClient(config); return c.listRooms(); } },
  { name: "postWebexMessage", description: "Post message to Webex room", inputSchema: { type: "object", properties: { roomId: { type: "string" }, text: { type: "string" } }, required: ["roomId", "text"] }, handler: async (config, params) => { const c = createWebexClient(config); return c.postMessage(params.roomId, params.text); } },
  { name: "listWebexPeople", description: "Search Webex people", inputSchema: { type: "object", properties: { email: { type: "string" } } }, handler: async (config, params) => { const c = createWebexClient(config); return c.listPeople(params.email); } },
  { name: "webexHealthCheck", description: "Check Webex connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createWebexClient(config); return { healthy: await c.healthCheck(), provider: "webex" }; } },
];