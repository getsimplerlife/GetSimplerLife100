import { createAnthropic_claudeClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";
export const anthropic_claudeActions: ActionDefinition[] = [
  { name: "listAnthropic_claudeItems", description: "List anthropic-claude items", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAnthropic_claudeClient(config); return c.listItems(); } },
  { name: "anthropic_claudeHealthCheck", description: "Check anthropic-claude connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAnthropic_claudeClient(config); return { healthy: await c.healthCheck(), provider: "anthropic-claude" }; } },
];
