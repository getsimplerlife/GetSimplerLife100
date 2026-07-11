import { createSlackClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const slackActions: ActionDefinition[] = [
  { name: "listSlackChannels", description: "List Slack conversations", inputSchema: { type: "object", properties: { types: { type: "string" } } }, handler: async (config, params) => { const c = createSlackClient(config); return c.listConversations(params.types); } },
  { name: "postSlackMessage", description: "Post message to Slack channel", inputSchema: { type: "object", properties: { channel: { type: "string" }, text: { type: "string" } }, required: ["channel", "text"] }, handler: async (config, params) => { const c = createSlackClient(config); return c.postMessage(params.channel, params.text); } },
  { name: "searchSlackMessages", description: "Search Slack messages", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createSlackClient(config); return c.searchMessages(params.query); } },
  { name: "listSlackUsers", description: "List Slack users", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSlackClient(config); return c.getUsers(); } },
  { name: "slackHealthCheck", description: "Check Slack connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createSlackClient(config); return { healthy: await c.healthCheck(), provider: "slack" }; } },
];