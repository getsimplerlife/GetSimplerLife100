import { createBasecampClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const basecampActions: ActionDefinition[] = [
  { name: "listBasecampProjects", description: "List Basecamp projects", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBasecampClient(config); return c.listProjects(); } },
  { name: "createBasecampTodo", description: "Create Basecamp todo", inputSchema: { type: "object", properties: { projectId: { type: "number" }, todolistId: { type: "number" }, content: { type: "string" } }, required: ["projectId", "todolistId", "content"] }, handler: async (config, params) => { const c = createBasecampClient(config); return c.createTodo(params.projectId, params.todolistId, params.content); } },
  { name: "basecampHealthCheck", description: "Check Basecamp connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createBasecampClient(config); return { healthy: await c.healthCheck(), provider: "basecamp" }; } },
];