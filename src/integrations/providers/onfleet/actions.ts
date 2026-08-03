import { createOnfleetClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Onfleet Integration — Actions.
 *
 * Typed action definitions for the Agent Runtime. Each action maps to an
 * Onfleet REST API v2 operation on the canonical https://onfleet.com/api/v2 host.
 */
export const onfleetActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "listOnfleetTasks",
    description: "List Onfleet delivery tasks (optional epoch-ms from/to window)",
    inputSchema: { type: "object", properties: { from: { type: "number" }, to: { type: "number" }, state: { type: "number" } } },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.listTasks({ from: params?.from, to: params?.to, state: params?.state });
    },
  },
  {
    name: "getOnfleetTask",
    description: "Get an Onfleet delivery task",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.getTask(params.id);
    },
  },
  {
    name: "listOnfleetWorkers",
    description: "List Onfleet workers (drivers)",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createOnfleetClient(config);
      return c.listWorkers();
    },
  },
  {
    name: "listOnfleetTeams",
    description: "List Onfleet teams",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createOnfleetClient(config);
      return c.listTeams();
    },
  },
  {
    name: "listOnfleetDestinations",
    description: "List Onfleet destinations",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createOnfleetClient(config);
      return c.listDestinations();
    },
  },
  {
    name: "listOnfleetRecipients",
    description: "List Onfleet recipients",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createOnfleetClient(config);
      return c.listRecipients();
    },
  },
  {
    name: "getOnfleetTeamRoute",
    description: "Read a team's route (ordered tasks in its container)",
    inputSchema: { type: "object", properties: { teamId: { type: "string" } }, required: ["teamId"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.getContainer(params.teamId);
    },
  },
  /* ── Monitor ── */
  {
    name: "listOnfleetTasksChangedSince",
    description: "Monitor Onfleet tasks updated in an epoch-ms window",
    inputSchema: { type: "object", properties: { from: { type: "number" }, to: { type: "number" } }, required: ["from"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.listTasksChangedSince(params.from, params.to);
    },
  },
  {
    name: "listOnfleetWorkersActivity",
    description: "Monitor Onfleet worker roster state",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createOnfleetClient(config);
      return c.listWorkers();
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createOnfleetTask",
    description: "Create an Onfleet delivery task",
    inputSchema: {
      type: "object",
      properties: {
        destination: { type: "object" },
        recipient: { type: "object" },
        notes: { type: "string" },
        completeAfter: { type: "number" },
        completeBefore: { type: "number" },
      },
      required: ["destination"],
    },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.createTask(params);
    },
  },
  {
    name: "updateOnfleetTask",
    description: "Update an Onfleet delivery task",
    inputSchema: { type: "object", properties: { id: { type: "string" }, data: { type: "object" } }, required: ["id", "data"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.updateTask(params.id, params.data);
    },
  },
  {
    name: "deleteOnfleetTask",
    description: "Delete an Onfleet delivery task",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return { deleted: await c.deleteTask(params.id) };
    },
  },
  {
    name: "completeOnfleetTask",
    description: "Complete an Onfleet delivery task",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.completeTask(params.id);
    },
  },
  {
    name: "createOnfleetWorker",
    description: "Create an Onfleet worker (driver)",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string" },
        teams: { type: "array", items: { type: "string" } },
        vehicle: { type: "object" },
        capacity: { type: "number" },
      },
      required: ["name", "phone"],
    },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.createWorker({ name: params.name, phone: params.phone, teams: params.teams, vehicle: params.vehicle, capacity: params.capacity });
    },
  },
  {
    name: "createOnfleetTeam",
    description: "Create an Onfleet team",
    inputSchema: { type: "object", properties: { name: { type: "string" }, workers: { type: "array" }, managers: { type: "array" } }, required: ["name"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.createTeam({ name: params.name, workers: params.workers, managers: params.managers });
    },
  },
  {
    name: "createOnfleetWebhook",
    description: "Subscribe an Onfleet webhook (url + trigger)",
    inputSchema: { type: "object", properties: { url: { type: "string" }, trigger: { type: "string" } }, required: ["url", "trigger"] },
    handler: async (config, params) => {
      const c = createOnfleetClient(config);
      return c.createWebhook({ url: params.url, trigger: params.trigger });
    },
  },
  /* ── Health Check ── */
  {
    name: "onfleetHealthCheck",
    description: "Check Onfleet connection",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createOnfleetClient(config);
      return { healthy: await c.healthCheck(), provider: "onfleet" };
    },
  },
];
