import { createXmlClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const xmlActions: ActionDefinition[] = [
  { name: "xmlQuery", description: "Run query on xml", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createXmlClient(config); return c.query(params.sql); } },
  { name: "xmlHealthCheck", description: "Check xml connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createXmlClient(config); return { healthy: await c.healthCheck(), provider: "xml" }; } },
];
