import { createIntercomClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const intercomActions: ActionDefinition[] = [
  { name: "listIntercomContacts", description: "List Intercom contacts", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIntercomClient(config); return c.listContacts(); } },
  { name: "createIntercomContact", description: "Create Intercom contact", inputSchema: { type: "object", properties: { email: { type: "string" }, name: { type: "string" }, phone: { type: "string" } }, required: ["email"] }, handler: async (config, params) => { const c = createIntercomClient(config); return c.createContact(params); } },
  { name: "listIntercomConversations", description: "List Intercom conversations", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIntercomClient(config); return c.listConversations(); } },
  { name: "intercomHealthCheck", description: "Check Intercom connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIntercomClient(config); return { healthy: await c.healthCheck(), provider: "intercom" }; } },
];