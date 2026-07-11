import { createDocuSignClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const docusignActions: ActionDefinition[] = [
  { name: "listDocuSignEnvelopes", description: "List DocuSign envelopes", inputSchema: { type: "object", properties: { fromDate: { type: "string" } } }, handler: async (config, params) => { const c = createDocuSignClient(config); return c.listEnvelopes(params.fromDate); } },
  { name: "sendDocuSignEnvelope", description: "Send DocuSign envelope", inputSchema: { type: "object", properties: { emailSubject: { type: "string" }, documents: { type: "array" }, recipients: { type: "object" } }, required: ["emailSubject"] }, handler: async (config, params) => { const c = createDocuSignClient(config); return c.sendEnvelope(params); } },
  { name: "getDocuSignEnvelope", description: "Get DocuSign envelope status", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, handler: async (config, params) => { const c = createDocuSignClient(config); return c.getEnvelope(params.id); } },
  { name: "docusignHealthCheck", description: "Check DocuSign connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createDocuSignClient(config); return { healthy: await c.healthCheck(), provider: "docusign" }; } },
];