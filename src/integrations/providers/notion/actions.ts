import { createNotionClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const notionActions: ActionDefinition[] = [
  { name: "queryNotionDatabase", description: "Query Notion database", inputSchema: { type: "object", properties: { databaseId: { type: "string" }, filter: { type: "object" } }, required: ["databaseId"] }, handler: async (config, params) => { const c = createNotionClient(config); return c.queryDatabase(params.databaseId, params.filter); } },
  { name: "createNotionPage", description: "Create Notion page", inputSchema: { type: "object", properties: { parent: { type: "object" }, properties: { type: "object" } }, required: ["parent", "properties"] }, handler: async (config, params) => { const c = createNotionClient(config); return c.createPage(params); } },
  { name: "searchNotion", description: "Search Notion (pages/databases)", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, handler: async (config, params) => { const c = createNotionClient(config); return c.search(params.query); } },
  { name: "notionHealthCheck", description: "Check Notion connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createNotionClient(config); return { healthy: await c.healthCheck(), provider: "notion" }; } },
];