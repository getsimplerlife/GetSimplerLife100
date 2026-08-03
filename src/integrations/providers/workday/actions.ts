import { createWorkdayClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

export const workdayActions: ActionDefinition[] = [
  /* ── Workers ── */
  {
    name: "listWorkdayWorkers",
    description: "List Workday workers (employees)",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.listWorkers(params?.limit as number | undefined);
    },
  },
  {
    name: "getWorkdayWorker",
    description: "Get Workday worker details",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.getWorker(params.id);
    },
  },
  {
    name: "updateWorkdayWorker",
    description: "Update Workday worker data",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        data: { type: "object" },
      },
      required: ["id", "data"],
    },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.updateWorker(params.id, params.data);
    },
  },
  /* ── Organizations ── */
  {
    name: "listWorkdayOrganizations",
    description: "List Workday organizations",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createWorkdayClient(config);
      return c.listOrganizations();
    },
  },
  /* ── Positions ── */
  {
    name: "listWorkdayPositions",
    description: "List Workday positions",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.listPositions(params?.limit as number | undefined);
    },
  },
  {
    name: "getWorkdayPosition",
    description: "Get Workday position details",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.getPosition(params.id);
    },
  },
  /* ── Time-off ── */
  {
    name: "listWorkdayTimeOffPlans",
    description: "List Workday time-off plans",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createWorkdayClient(config);
      return c.listTimeOffPlans();
    },
  },
  {
    name: "getWorkdayTimeOffBalance",
    description: "Get Workday time-off balance for a worker",
    inputSchema: { type: "object", properties: { workerId: { type: "string" } }, required: ["workerId"] },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.getTimeOffBalance(params.workerId);
    },
  },
  /* ── Job Requisitions ── */
  {
    name: "listWorkdayJobRequisitions",
    description: "List Workday job requisitions",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.listJobRequisitions(params?.limit as number | undefined);
    },
  },
  {
    name: "createWorkdayJobRequisition",
    description: "Create a Workday job requisition",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        positionId: { type: "string" },
        description: { type: "string" },
      },
      required: ["title"],
    },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.createJobRequisition(params);
    },
  },
  /* ── Onboarding ── */
  {
    name: "initiateWorkdayOnboarding",
    description: "Initiate onboarding for a new hire",
    inputSchema: {
      type: "object",
      properties: {
        workerId: { type: "string" },
        startDate: { type: "string" },
      },
      required: ["workerId", "startDate"],
    },
    handler: async (config, params) => {
      const c = createWorkdayClient(config);
      return c.initiateOnboarding(params);
    },
  },
  /* ── Health Check ── */
  {
    name: "workdayHealthCheck",
    description: "Check Workday connection health",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createWorkdayClient(config);
      return { healthy: await c.healthCheck(), provider: "workday" };
    },
  },
];
