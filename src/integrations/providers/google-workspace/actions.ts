import { createGWSClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const gwsActions: ActionDefinition[] = [
  { name: "listGWSMessages", description: "List Google Workspace Gmail messages", inputSchema: { type: "object", properties: { query: { type: "string" }, max: { type: "number" } } }, handler: async (config, params) => { const c = createGWSClient(config); return c.listMessages(params.query, params.max); } },
  { name: "listGWSCalendars", description: "List Google Workspace calendars", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGWSClient(config); return c.listCalendars(); } },
  { name: "listGWSEvents", description: "List Google Calendar events", inputSchema: { type: "object", properties: { calendarId: { type: "string" }, max: { type: "number" } } }, handler: async (config, params) => { const c = createGWSClient(config); return c.listEvents(params.calendarId, params.max); } },
  { name: "listGWSFiles", description: "List Google Drive files", inputSchema: { type: "object", properties: { query: { type: "string" } } }, handler: async (config, params) => { const c = createGWSClient(config); return c.listFiles(params.query); } },
  { name: "listGWSUsers", description: "List Workspace directory users", inputSchema: { type: "object", properties: { domain: { type: "string" } } }, handler: async (config, params) => { const c = createGWSClient(config); return c.listUsers(params.domain); } },
  { name: "gwsHealthCheck", description: "Check Google Workspace connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGWSClient(config); return { healthy: await c.healthCheck(), provider: "google-workspace" }; } },
];