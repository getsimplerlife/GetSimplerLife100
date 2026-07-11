import { createTrelloClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const trelloActions: ActionDefinition[] = [
  { name: "listTrelloBoards", description: "List Trello boards", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTrelloClient(config); return c.listBoards(); } },
  { name: "createTrelloCard", description: "Create Trello card", inputSchema: { type: "object", properties: { listId: { type: "string" }, name: { type: "string" }, desc: { type: "string" } }, required: ["listId", "name"] }, handler: async (config, params) => { const c = createTrelloClient(config); return c.createCard(params.listId, params.name, params.desc); } },
  { name: "listTrelloCards", description: "List Trello list cards", inputSchema: { type: "object", properties: { listId: { type: "string" } }, required: ["listId"] }, handler: async (config, params) => { const c = createTrelloClient(config); return c.listCards(params.listId); } },
  { name: "trelloHealthCheck", description: "Check Trello connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createTrelloClient(config); return { healthy: await c.healthCheck(), provider: "trello" }; } },
];