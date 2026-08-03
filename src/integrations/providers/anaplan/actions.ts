import { createAnaplanClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

export const anaplanActions: ActionDefinition[] = [
  // ── understand (read) ──
  {
    name: "listAnaplanWorkspaces",
    description: "List Anaplan workspaces",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => { const c = createAnaplanClient(config); return c.listWorkspaces(); },
  },
  {
    name: "listAnaplanModels",
    description: "List Anaplan models in a workspace",
    inputSchema: { type: "object", properties: { workspaceId: { type: "string" } } },
    handler: async (config, params) => { const c = createAnaplanClient(config); return c.listModels((params as any)?.workspaceId); },
  },
  {
    name: "listAnaplanModules",
    description: "List Anaplan modules in a model",
    inputSchema: { type: "object", properties: { modelId: { type: "string" }, workspaceId: { type: "string" } }, required: ["modelId"] },
    handler: async (config, params) => { const c = createAnaplanClient(config); return c.listModules((params as any).modelId, (params as any)?.workspaceId); },
  },
  {
    name: "listAnaplanViews",
    description: "List Anaplan views/budgets in a model",
    inputSchema: { type: "object", properties: { modelId: { type: "string" }, workspaceId: { type: "string" } }, required: ["modelId"] },
    handler: async (config, params) => { const c = createAnaplanClient(config); return c.listViews((params as any).modelId, (params as any)?.workspaceId); },
  },
  {
    name: "listAnaplanScenarios",
    description: "List Anaplan scenarios",
    inputSchema: { type: "object", properties: { modelId: { type: "string" }, workspaceId: { type: "string" } }, required: ["modelId"] },
    handler: async (config, params) => { const c = createAnaplanClient(config); return c.listScenarios((params as any).modelId, (params as any)?.workspaceId); },
  },
  {
    name: "getAnaplanActualsVsBudget",
    description: "Get Anaplan actuals-vs-budget processes",
    inputSchema: { type: "object", properties: { modelId: { type: "string" }, workspaceId: { type: "string" } }, required: ["modelId"] },
    handler: async (config, params) => { const c = createAnaplanClient(config); return c.getActualsVsBudget((params as any).modelId, (params as any)?.workspaceId); },
  },
  // ── automate (write) ──
  {
    name: "createAnaplanForecast",
    description: "Create an Anaplan forecast via import",
    inputSchema: { type: "object", properties: { modelId: { type: "string" }, workspaceId: { type: "string" }, data: { type: "object" } }, required: ["modelId"] },
    handler: async (config, params) => { const c = createAnaplanClient(config); return c.createImport((params as any).modelId, (params as any).data || {}, (params as any)?.workspaceId); },
  },
  {
    name: "updateAnaplanForecastAssumptions",
    description: "Update Anaplan forecast assumptions (cell data)",
    inputSchema: { type: "object", properties: { modelId: { type: "string" }, viewId: { type: "string" }, workspaceId: { type: "string" }, data: { type: "object" } }, required: ["modelId", "viewId"] },
    handler: async (config, params) => { const c = createAnaplanClient(config); return c.updateCellData((params as any).modelId, (params as any).viewId, (params as any).data || {}, (params as any)?.workspaceId); },
  },
  // ── health ──
  {
    name: "anaplanHealthCheck",
    description: "Check Anaplan connection health",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => { const c = createAnaplanClient(config); return { healthy: await c.healthCheck(), provider: "anaplan" }; },
  },
];
