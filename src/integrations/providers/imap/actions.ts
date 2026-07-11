import { createIMAPClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const imapActions: ActionDefinition[] = [
  { name: "listIMAPMailboxes", description: "List IMAP mailboxes/folders", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIMAPClient(config); return c.listMailboxes(); } },
  { name: "searchIMAPMessages", description: "Search IMAP messages by criteria", inputSchema: { type: "object", properties: { mailbox: { type: "string" }, from: { type: "string" }, subject: { type: "string" }, since: { type: "string" }, unread: { type: "boolean" } } }, handler: async (config, params) => { const c = createIMAPClient(config); return c.searchMessages(params); } },
  { name: "imapHealthCheck", description: "Check IMAP connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createIMAPClient(config); return { healthy: await c.healthCheck(), provider: "imap" }; } },
];