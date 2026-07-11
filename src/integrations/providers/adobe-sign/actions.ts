import { createAdobeSignClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const adobeSignActions: ActionDefinition[] = [
  { name: "listAdobeSignAgreements", description: "List Adobe Sign agreements", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAdobeSignClient(config); return c.listAgreements(); } },
  { name: "sendAdobeSignAgreement", description: "Send Adobe Sign agreement", inputSchema: { type: "object", properties: { name: { type: "string" }, participantSetsInfo: { type: "array" }, fileInfos: { type: "array" } }, required: ["name", "participantSetsInfo"] }, handler: async (config, params) => { const c = createAdobeSignClient(config); return c.sendAgreement(params); } },
  { name: "getAdobeSignAgreementStatus", description: "Get Adobe Sign agreement status", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, handler: async (config, params) => { const c = createAdobeSignClient(config); return c.getAgreementStatus(params.id); } },
  { name: "adobeSignHealthCheck", description: "Check Adobe Sign connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAdobeSignClient(config); return { healthy: await c.healthCheck(), provider: "adobe-sign" }; } },
];