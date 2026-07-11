import { createEpicor_kinetic_mfgClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const epicor_kinetic_mfgActions: ActionDefinition[] = [
  { name: "listEpicor_kinetic_mfgItems", description: "List epicor-kinetic-mfg items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEpicor_kinetic_mfgClient(config); return c.listItems(); } },
  { name: "epicor_kinetic_mfgHealthCheck", description: "Check epicor-kinetic-mfg connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createEpicor_kinetic_mfgClient(config); return { healthy: await c.healthCheck(), provider: "epicor-kinetic-mfg" }; } },
];
