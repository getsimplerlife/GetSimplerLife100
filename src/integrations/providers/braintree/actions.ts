import { createBraintreeClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const braintreeActions: ActionDefinition[] = [
  { name: "listBraintreeItems", description: "List braintree items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBraintreeClient(config); return c.listItems(); } },
  { name: "braintreeHealthCheck", description: "Check braintree connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBraintreeClient(config); return { healthy: await c.healthCheck(), provider: "braintree" }; } },
];
