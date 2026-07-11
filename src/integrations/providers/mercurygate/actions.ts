import { createMGClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";
export const mercurygateActions: ActionDefinition[] = [
  { name: "listMGShipments", description: "List MercuryGate shipments", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMGClient(config); return c.listShipments(); } },
  { name: "mercurygateHealthCheck", description: "Check MercuryGate connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createMGClient(config); return { healthy: await c.healthCheck(), provider: "mercurygate" }; } },
];