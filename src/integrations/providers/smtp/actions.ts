import { createSMTPClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const smtpActions: ActionDefinition[] = [
  { name: "sendSMTPMail", description: "Send email via SMTP", inputSchema: { type: "object", properties: { to: { type: "string" }, subject: { type: "string" }, text: { type: "string" }, html: { type: "string" }, cc: { type: "string" } }, required: ["to", "subject"] }, handler: async (config, params) => { const c = createSMTPClient(config); return c.sendMail(params as { to: string | string[]; subject: string; text?: string; html?: string; cc?: string; bcc?: string; attachments?: any[] }); } },
  { name: "smtpHealthCheck", description: "Check SMTP connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSMTPClient(config); return { healthy: await c.healthCheck(), provider: "smtp" }; } },
];