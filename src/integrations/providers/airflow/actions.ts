/**
 * Airflow Orchestration Integration — Actions
 *
 * Action definitions for the Agent Runtime.
 * Wraps Airflow client operations as typed LLM-callable actions.
 */
import { createAirflowClient } from "./client";
import type { ConnectionConfig } from "../../framework/connection";

export interface ActionDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  handler: (config: ConnectionConfig, params: Record<string, any>) => Promise<any>;
}

// ── DAG Actions ─────────────────────────────────────────────────────────────

export const listDAGs: ActionDefinition = {
  name: "airflow_dag_list",
  description: "List all DAGs in Airflow",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Maximum number of DAGs to return (default: 100)" },
      offset: { type: "number", description: "Pagination offset" },
      orderBy: { type: "string", description: "Order by field (e.g., 'dag_id')" },
    },
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.listDAGs(params.limit, params.offset, params.orderBy);
  },
};

export const getDAG: ActionDefinition = {
  name: "airflow_dag_get",
  description: "Get details of a specific Airflow DAG",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID" },
    },
    required: ["dagId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.getDAG(params.dagId);
  },
};

export const pauseDAG: ActionDefinition = {
  name: "airflow_dag_pause",
  description: "Pause an Airflow DAG",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID to pause" },
    },
    required: ["dagId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.pauseDAG(params.dagId);
  },
};

export const unpauseDAG: ActionDefinition = {
  name: "airflow_dag_unpause",
  description: "Unpause/resume an Airflow DAG",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID to unpause" },
    },
    required: ["dagId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.unpauseDAG(params.dagId);
  },
};

// ── DAG Run Actions ─────────────────────────────────────────────────────────

export const triggerDAGRun: ActionDefinition = {
  name: "airflow_dag_trigger",
  description: "Trigger a DAG run in Airflow",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID to trigger" },
      conf: { type: "object", description: "Optional configuration JSON to pass to the DAG run" },
      dagRunId: { type: "string", description: "Optional custom DAG run ID" },
      logicalDate: { type: "string", description: "Optional logical date for the run (ISO format)" },
    },
    required: ["dagId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.triggerDAGRun(params.dagId, params.conf, params.dagRunId, params.logicalDate);
  },
};

export const listDAGRuns: ActionDefinition = {
  name: "airflow_dag_runs",
  description: "List DAG runs for a specific Airflow DAG",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID" },
      limit: { type: "number", description: "Maximum number of runs (default: 100)" },
      offset: { type: "number", description: "Pagination offset" },
      state: { type: "string", description: "Filter by state (queued, running, success, failed, cancelled)" },
      orderBy: { type: "string", description: "Order by field (e.g., '-start_date')" },
    },
    required: ["dagId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.listDAGRuns(params.dagId, params.limit, params.offset, params.orderBy, params.state);
  },
};

export const getDAGRunStatus: ActionDefinition = {
  name: "airflow_dag_status",
  description: "Get the status of a specific DAG run",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID" },
      dagRunId: { type: "string", description: "DAG run ID" },
    },
    required: ["dagId", "dagRunId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.getDAGRun(params.dagId, params.dagRunId);
  },
};

// ── Task Instance Actions ───────────────────────────────────────────────────

export const listTaskInstances: ActionDefinition = {
  name: "airflow_tasks_list",
  description: "List task instances for a DAG run",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID" },
      dagRunId: { type: "string", description: "DAG run ID" },
      limit: { type: "number", description: "Maximum number of tasks (default: 100)" },
    },
    required: ["dagId", "dagRunId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.listTaskInstances(params.dagId, params.dagRunId, params.limit);
  },
};

export const getTaskLog: ActionDefinition = {
  name: "airflow_task_log",
  description: "Get task instance logs from Airflow",
  inputSchema: {
    type: "object",
    properties: {
      dagId: { type: "string", description: "DAG ID" },
      dagRunId: { type: "string", description: "DAG run ID" },
      taskId: { type: "string", description: "Task ID" },
      tryNumber: { type: "number", description: "Try number (default: 1)" },
      fullContent: { type: "boolean", description: "Return full text content (default: false)" },
    },
    required: ["dagId", "dagRunId", "taskId"],
  },
  handler: async (config, params) => {
    const client = createAirflowClient(config);
    return client.getTaskLog(params.dagId, params.dagRunId, params.taskId, params.tryNumber || 1, params.fullContent);
  },
};

// ── Health Check ────────────────────────────────────────────────────────────

export const healthCheck: ActionDefinition = {
  name: "airflow_health_check",
  description: "Check if the Airflow connection is healthy",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (config) => {
    const client = createAirflowClient(config);
    const healthy = await client.healthCheck();
    return { healthy, provider: "airflow" };
  },
};

// ── All Actions Export ──────────────────────────────────────────────────────

export const airflowActions: ActionDefinition[] = [
  listDAGs,
  getDAG,
  pauseDAG,
  unpauseDAG,
  triggerDAGRun,
  listDAGRuns,
  getDAGRunStatus,
  listTaskInstances,
  getTaskLog,
  healthCheck,
];