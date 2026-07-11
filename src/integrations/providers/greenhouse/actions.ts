import { createGreenhouseClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const greenhouseActions: ActionDefinition[] = [
  { name: "listGreenhouseJobs", description: "List Greenhouse jobs", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGreenhouseClient(config); return c.listJobs(); } },
  { name: "listGreenhouseCandidates", description: "List Greenhouse candidates", inputSchema: { type: "object", properties: { limit: { type: "number" } } }, handler: async (config, params) => { const c = createGreenhouseClient(config); return c.listCandidates(params.limit); } },
  { name: "createGreenhouseCandidate", description: "Create Greenhouse candidate", inputSchema: { type: "object", properties: { first_name: { type: "string" }, last_name: { type: "string" }, email: { type: "string" }, phone: { type: "string" } }, required: ["first_name", "last_name"] }, handler: async (config, params) => { const c = createGreenhouseClient(config); return c.createCandidate(params); } },
  { name: "greenhouseHealthCheck", description: "Check Greenhouse connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createGreenhouseClient(config); return { healthy: await c.healthCheck(), provider: "greenhouse" }; } },
];