import { createTableauClient } from "./client";
import type { ActionDefinition } from "../salesforce/actions";

/**
 * Tableau Integration — Actions.
 *
 * Typed action definitions for the Agent Runtime. Each action maps to a Tableau
 * REST API operation against the tenant's canonical `{serverUrl}/api/{version}` host.
 */
export const tableauActions: ActionDefinition[] = [
  /* ── Understand (read) ── */
  {
    name: "listTableauWorkbooks",
    description: "List Tableau workbooks",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listWorkbooks(params?.limit as number | undefined);
    },
  },
  {
    name: "getTableauWorkbook",
    description: "Get Tableau workbook details",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.getWorkbook(params.id);
    },
  },
  {
    name: "listTableauDatasources",
    description: "List Tableau datasources",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listDatasources(params?.limit as number | undefined);
    },
  },
  {
    name: "getTableauDatasource",
    description: "Get Tableau datasource details",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.getDatasource(params.id);
    },
  },
  {
    name: "listTableauProjects",
    description: "List Tableau projects",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listProjects(params?.limit as number | undefined);
    },
  },
  {
    name: "getTableauProject",
    description: "Get Tableau project details",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.getProject(params.id);
    },
  },
  {
    name: "listTableauUsers",
    description: "List Tableau site users",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listUsers(params?.limit as number | undefined);
    },
  },
  {
    name: "listTableauReports",
    description: "List Tableau views (reports)",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listViews(params?.limit as number | undefined);
    },
  },
  {
    name: "listTableauDashboards",
    description: "List Tableau dashboards (dashboard-type views)",
    inputSchema: { type: "object", properties: { limit: { type: "number" } } },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listDashboards(params?.limit as number | undefined);
    },
  },
  {
    name: "listTableauSchedules",
    description: "List Tableau extract refresh schedules",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createTableauClient(config);
      return c.listSchedules();
    },
  },
  {
    name: "listTableauFlows",
    description: "List Tableau flows",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createTableauClient(config);
      return c.listFlows();
    },
  },
  /* ── Monitor ── */
  {
    name: "listTableauWorkbooksChangedSince",
    description: "Monitor Tableau workbooks updated since an ISO timestamp",
    inputSchema: { type: "object", properties: { fromDate: { type: "string" } }, required: ["fromDate"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listWorkbooksChangedSince(params.fromDate);
    },
  },
  {
    name: "listTableauDatasourcesChangedSince",
    description: "Monitor Tableau datasources updated since an ISO timestamp",
    inputSchema: { type: "object", properties: { fromDate: { type: "string" } }, required: ["fromDate"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listDatasourcesChangedSince(params.fromDate);
    },
  },
  {
    name: "listTableauDatasourceRefreshes",
    description: "Monitor Tableau datasource refresh jobs",
    inputSchema: { type: "object", properties: { datasourceId: { type: "string" } }, required: ["datasourceId"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.listDatasourceRefreshes(params.datasourceId);
    },
  },
  /* ── Automate (write) ── */
  {
    name: "createTableauProject",
    description: "Create a Tableau project",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        parentProjectId: { type: "string" },
      },
      required: ["name"],
    },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.createProject({ name: params.name, description: params.description, parentProjectId: params.parentProjectId });
    },
  },
  {
    name: "updateTableauProject",
    description: "Update a Tableau project",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, description: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.updateProject(params.id, { name: params.name, description: params.description });
    },
  },
  {
    name: "deleteTableauProject",
    description: "Delete a Tableau project",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return { deleted: await c.deleteProject(params.id) };
    },
  },
  {
    name: "addTableauSiteUser",
    description: "Add a user to the Tableau site",
    inputSchema: { type: "object", properties: { name: { type: "string" }, siteRole: { type: "string" } }, required: ["name"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.addSiteUser({ name: params.name, siteRole: params.siteRole });
    },
  },
  {
    name: "removeTableauSiteUser",
    description: "Remove a user from the Tableau site",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return { removed: await c.removeSiteUser(params.id) };
    },
  },
  {
    name: "updateTableauWorkbook",
    description: "Update a Tableau workbook (name/showTabs)",
    inputSchema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, showTabs: { type: "boolean" } }, required: ["id"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.updateWorkbook(params.id, { name: params.name, showTabs: params.showTabs });
    },
  },
  {
    name: "refreshTableauDatasource",
    description: "Start an extract refresh for a Tableau datasource",
    inputSchema: { type: "object", properties: { datasourceId: { type: "string" } }, required: ["datasourceId"] },
    handler: async (config, params) => {
      const c = createTableauClient(config);
      return c.refreshDatasource(params.datasourceId);
    },
  },
  /* ── Health Check ── */
  {
    name: "tableauHealthCheck",
    description: "Check Tableau connection",
    inputSchema: { type: "object", properties: {} },
    handler: async (config) => {
      const c = createTableauClient(config);
      return { healthy: await c.healthCheck(), provider: "tableau" };
    },
  },
];
