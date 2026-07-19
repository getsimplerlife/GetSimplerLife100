/**
 * Airflow Orchestration Integration — Client
 *
 * Typed API client for Apache Airflow REST API.
 * Supports DAG operations, task monitoring, and log reading.
 */
import { HttpClient } from "../../framework/client";
import type { ConnectionConfig } from "../../framework/connection";
import { getAirflowApiUrl, getAirflowAuthHeaders, AirflowAuthConfig } from "./auth";

// ── Type Definitions ────────────────────────────────────────────────────────

export interface DAG {
  dag_id: string;
  description?: string;
  is_paused: boolean;
  is_active: boolean;
  is_subdag: boolean;
  fileloc: string;
  owners: string[];
  root_dag_id?: string;
  schedule_interval?: any;
  tags?: { name: string }[];
  timetable_description?: string;
  max_active_runs?: number;
  max_active_tasks?: number;
  default_view?: string;
}

export interface DAGRun {
  dag_run_id: string;
  dag_id: string;
  logical_date: string;
  execution_date: string;
  start_date?: string;
  end_date?: string;
  state: "queued" | "running" | "success" | "failed" | "cancelled";
  run_type: "manual" | "scheduled" | "backfill";
  external_trigger: boolean;
  conf?: Record<string, any>;
  data_interval_start?: string;
  data_interval_end?: string;
  last_scheduling_decision?: string;
}

export interface TaskInstance {
  task_id: string;
  dag_id: string;
  dag_run_id: string;
  execution_date: string;
  start_date?: string;
  end_date?: string;
  duration?: number;
  state: string;
  try_number: number;
  max_tries: number;
  hostname?: string;
  unixname?: string;
  pool?: string;
  queue?: string;
  priority_weight?: number;
  operator?: string;
  queued_when?: string;
  pid?: number;
  executor_config?: string;
  sla_miss?: any;
  rendered_fields?: any;
  mapped_states?: any;
  task_display_name?: string;
}

export interface TaskLog {
  content: string;
  continuation_token?: string;
}

export interface DAGCollection {
  dags: DAG[];
  total_entries: number;
  total_entries_metadata?: any;
}

export interface DAGRunCollection {
  dag_runs: DAGRun[];
  total_entries: number;
}

export interface TaskInstanceCollection {
  task_instances: TaskInstance[];
  total_entries: number;
}

export interface Pool {
  name: string;
  slots: number;
  occupied_slots: number;
  running_slots: number;
  queued_slots: number;
  scheduled_slots: number;
  open_slots: number;
  description?: string;
}

export class AirflowClient {
  private client: HttpClient;
  private authConfig: AirflowAuthConfig;
  private authHeaders: Record<string, string>;

  constructor(config: ConnectionConfig) {
    this.authConfig = {
      baseUrl: config.baseUrl || "http://localhost:8080",
      username: config.username,
      password: config.password,
      apiKey: config.apiKey,
      jwtToken: config.jwtToken,
    };
    this.authHeaders = getAirflowAuthHeaders(this.authConfig);

    this.client = new HttpClient({
      baseUrl: getAirflowApiUrl(this.authConfig),
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
  }

  // ── DAG Operations ──────────────────────────────────────────────────────

  /**
   * List all DAGs
   */
  async listDAGs(limit: number = 100, offset: number = 0, orderBy?: string): Promise<DAGCollection> {
    let path = `/dags?limit=${limit}&offset=${offset}`;
    if (orderBy) path += `&order_by=${encodeURIComponent(orderBy)}`;
    const res = await this.client.get<any>(path, this.authHeaders);
    return {
      dags: res.data.dags || [],
      total_entries: res.data.total_entries || 0,
    };
  }

  /**
   * Get details of a specific DAG
   */
  async getDAG(dagId: string): Promise<DAG> {
    const res = await this.client.get<any>(
      `/dags/${encodeURIComponent(dagId)}`,
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * Pause a DAG
   */
  async pauseDAG(dagId: string): Promise<DAG> {
    const res = await this.client.patch<any>(
      `/dags/${encodeURIComponent(dagId)}`,
      JSON.stringify({ is_paused: true }),
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * Unpause a DAG
   */
  async unpauseDAG(dagId: string): Promise<DAG> {
    const res = await this.client.patch<any>(
      `/dags/${encodeURIComponent(dagId)}`,
      JSON.stringify({ is_paused: false }),
      this.authHeaders,
    );
    return res.data;
  }

  // ── DAG Run Operations ──────────────────────────────────────────────────

  /**
   * Trigger a DAG run
   */
  async triggerDAGRun(
    dagId: string,
    conf?: Record<string, any>,
    dagRunId?: string,
    logicalDate?: string,
    note?: string,
  ): Promise<DAGRun> {
    const body: any = {};
    if (conf) body.conf = conf;
    if (dagRunId) body.dag_run_id = dagRunId;
    if (logicalDate) body.logical_date = logicalDate;
    if (note) body.note = note;

    const res = await this.client.post<any>(
      `/dags/${encodeURIComponent(dagId)}/dagRuns`,
      JSON.stringify(body),
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * List DAG runs for a specific DAG
   */
  async listDAGRuns(
    dagId: string,
    limit: number = 100,
    offset: number = 0,
    orderBy?: string,
    state?: string,
  ): Promise<DAGRunCollection> {
    let path = `/dags/${encodeURIComponent(dagId)}/dagRuns?limit=${limit}&offset=${offset}`;
    if (orderBy) path += `&order_by=${encodeURIComponent(orderBy)}`;
    if (state) path += `&state=${state}`;
    const res = await this.client.get<any>(path, this.authHeaders);
    return {
      dag_runs: res.data.dag_runs || [],
      total_entries: res.data.total_entries || 0,
    };
  }

  /**
   * Get a specific DAG run
   */
  async getDAGRun(dagId: string, dagRunId: string): Promise<DAGRun> {
    const res = await this.client.get<any>(
      `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}`,
      this.authHeaders,
    );
    return res.data;
  }

  /**
   * Clear a DAG run (set to failed/restart)
   */
  async clearDAGRun(dagId: string, dagRunId: string): Promise<void> {
    await this.client.delete(
      `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}`,
      this.authHeaders,
    );
  }

  // ── Task Instance Operations ────────────────────────────────────────────

  /**
   * List task instances for a DAG run
   */
  async listTaskInstances(
    dagId: string,
    dagRunId: string,
    limit: number = 100,
    offset: number = 0,
  ): Promise<TaskInstanceCollection> {
    const path = `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}/taskInstances?limit=${limit}&offset=${offset}`;
    const res = await this.client.get<any>(path, this.authHeaders);
    return {
      task_instances: res.data.task_instances || [],
      total_entries: res.data.total_entries || 0,
    };
  }

  /**
   * Get a specific task instance
   */
  async getTaskInstance(dagId: string, dagRunId: string, taskId: string): Promise<TaskInstance> {
    const res = await this.client.get<any>(
      `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}/taskInstances/${encodeURIComponent(taskId)}`,
      this.authHeaders,
    );
    return res.data;
  }

  // ── Task Log Operations ─────────────────────────────────────────────────

  /**
   * Get task instance logs
   */
  async getTaskLog(
    dagId: string,
    dagRunId: string,
    taskId: string,
    tryNumber: number = 1,
    fullContent: boolean = false,
  ): Promise<TaskLog> {
    const path = `/dags/${encodeURIComponent(dagId)}/dagRuns/${encodeURIComponent(dagRunId)}/taskInstances/${encodeURIComponent(taskId)}/logs/${tryNumber}`;
    const headers = {
      ...this.authHeaders,
      Accept: fullContent ? "text/plain" : "application/json",
    };
    const res = await this.client.get<any>(path, headers);
    return {
      content: typeof res.data === "string" ? res.data : JSON.stringify(res.data),
    };
  }

  // ── Pool Operations ─────────────────────────────────────────────────────

  /**
   * List pools
   */
  async listPools(limit: number = 100): Promise<Pool[]> {
    const res = await this.client.get<any>(
      `/pools?limit=${limit}`,
      this.authHeaders,
    );
    return res.data.pools || [];
  }

  // ── Health Check ────────────────────────────────────────────────────────

  async healthCheck(): Promise<boolean> {
    try {
      const res = await this.client.get("/health", this.authHeaders);
      return !!(res.data?.metadatabase?.status === "healthy" || res.data?.scheduler?.status === "healthy");
    } catch {
      return false;
    }
  }
}

/**
 * Create an Airflow client from stored connection config
 */
export function createAirflowClient(config: ConnectionConfig): AirflowClient {
  return new AirflowClient(config);
}