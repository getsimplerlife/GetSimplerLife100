import { createFormstackClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const formstackActions: ActionDefinition[] = [
  { name: "listFormstackItems", description: "List formstack items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFormstackClient(config); return c.listItems(); } },
  { name: "formstackHealthCheck", description: "Check formstack connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createFormstackClient(config); return { healthy: await c.healthCheck(), provider: "formstack" }; } },
];
