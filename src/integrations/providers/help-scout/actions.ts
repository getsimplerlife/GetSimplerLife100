import { createHelpScoutClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const helpScoutActions: ActionDefinition[] = [
  { name: "listHelpScoutMailboxes", description: "List Help Scout mailboxes", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createHelpScoutClient(config); return c.listMailboxes(); } },
  { name: "listHelpScoutConversations", description: "List Help Scout conversations", inputSchema: { type: "object", properties: { mailboxId: { type: "number" } }, required: ["mailboxId"] }, handler: async (config, params) => { const c = createHelpScoutClient(config); return c.listConversations(params.mailboxId); } },
  { name: "helpScoutHealthCheck", description: "Check Help Scout connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createHelpScoutClient(config); return { healthy: await c.healthCheck(), provider: "help-scout" }; } },
];