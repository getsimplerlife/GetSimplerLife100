import { createLeverClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const leverActions: ActionDefinition[] = [
  { name: "listLeverOpportunities", description: "List Lever opportunities", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createLeverClient(config); return c.listOpportunities(); } },
  { name: "createLeverCandidate", description: "Create Lever candidate", inputSchema: { type: "object", properties: { name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, stage: { type: "string" } }, required: ["name"] }, handler: async (config, params) => { const c = createLeverClient(config); return c.createCandidate(params); } },
  { name: "leverHealthCheck", description: "Check Lever connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createLeverClient(config); return { healthy: await c.healthCheck(), provider: "lever" }; } },
];