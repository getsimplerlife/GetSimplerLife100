import { createAsanaClient } from "./client"; import type { ActionDefinition } from "../salesforce/actions";

export const asanaActions: ActionDefinition[] = [
  { name: "listAsanaProjects", description: "List Asana projects", inputSchema: { type: "object", properties: { workspace: { type: "string" } } }, handler: async (config, params) => { const c = createAsanaClient(config); return c.listProjects(params.workspace); } },
  { name: "createAsanaTask", description: "Create Asana task", inputSchema: { type: "object", properties: { projects: { type: "array" }, name: { type: "string" }, notes: { type: "string" }, assignee: { type: "string" }, due_on: { type: "string" } }, required: ["projects", "name"] }, handler: async (config, params) => { const c = createAsanaClient(config); return c.createTask(params); } },
  { name: "listAsanaTasks", description: "List Asana project tasks", inputSchema: { type: "object", properties: { projectId: { type: "string" } }, required: ["projectId"] }, handler: async (config, params) => { const c = createAsanaClient(config); return c.listTasks(params.projectId); } },
  { name: "asanaHealthCheck", description: "Check Asana connection", inputSchema: { type: "object", properties: {} }, handler: async (config) => { const c = createAsanaClient(config); return { healthy: await c.healthCheck(), provider: "asana" }; } },
];