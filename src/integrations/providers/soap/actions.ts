import { createSoapClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const soapActions: ActionDefinition[] = [
  { name: "soapQuery", description: "Run query on soap", inputSchema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] }, handler: async (config, params) => { const c = createSoapClient(config); return c.query(params.sql); } },
  { name: "soapHealthCheck", description: "Check soap connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSoapClient(config); return { healthy: await c.healthCheck(), provider: "soap" }; } },
];
