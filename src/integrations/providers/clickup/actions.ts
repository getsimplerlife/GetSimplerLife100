import { createClickUpClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const clickUpActions: ActionDefinition[] = [
  { name: "listClickUpSpaces", description: "List ClickUp spaces", inputSchema: { type: "object", properties: { teamId: { type: "string" } }, required: ["teamId"] }, handler: async (config, params) => { const c = createClickUpClient(config); return c.listSpaces(params.teamId); } },
  { name: "createClickUpTask", description: "Create ClickUp task", inputSchema: { type: "object", properties: { listId: { type: "string" }, name: { type: "string" }, description: { type: "string" }, assignees: { type: "array" } }, required: ["listId", "name"] }, handler: async (config, params) => { const c = createClickUpClient(config); return c.createTask(params.listId, params); } },
  { name: "listClickUpTasks", description: "List ClickUp list tasks", inputSchema: { type: "object", properties: { listId: { type: "string" } }, required: ["listId"] }, handler: async (config, params) => { const c = createClickUpClient(config); return c.listTasks(params.listId); } },
  { name: "clickUpHealthCheck", description: "Check ClickUp connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createClickUpClient(config); return { healthy: await c.healthCheck(), provider: "clickup" }; } },
];