import { HttpClient } from "../../framework/client";
import { getAnaplanAuthHeaders, ANAPLAN_BASE_URL, validateAnaplanCredential, type AnaplanCredential } from "./auth";
import type { ConnectionConfig } from "../../framework/connection";

/**
 * Canonical Anaplan API client.
 *
 * All paths are relative to https://api.anaplan.com/2/0.
 * Reads are fail-closed; writes require AnaplanAuthToken header.
 */
export class AnaplanClient {
  private client: HttpClient;
  private authToken: string;
  private workspaceId?: string;

  constructor(authToken: string, workspaceId?: string) {
    if (!authToken) throw new Error("Anaplan authToken is required");
    this.authToken = authToken;
    this.workspaceId = workspaceId;
    this.client = new HttpClient({
      baseUrl: ANAPLAN_BASE_URL,
      rateLimit: { maxRequestsPerSecond: 5 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
  }

  private get headers(): Record<string, string> {
    return getAnaplanAuthHeaders(this.authToken);
  }

  // ── Workspaces ──
  async listWorkspaces(): Promise<any[]> {
    const r = await this.client.get("/workspaces", this.headers);
    return r.data?.workspaces || [];
  }

  // ── Models ──
  async listModels(workspaceId?: string): Promise<any[]> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required to list models");
    const r = await this.client.get(`/workspaces/${wid}/models`, this.headers);
    return r.data?.models || [];
  }

  async getModel(modelId: string, workspaceId?: string): Promise<any> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.get(`/workspaces/${wid}/models/${modelId}`, this.headers);
    return r.data?.model;
  }

  // ── Modules ──
  async listModules(modelId: string, workspaceId?: string): Promise<any[]> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.get(`/workspaces/${wid}/models/${modelId}/modules`, this.headers);
    return r.data?.modules || [];
  }

  // ── Budgets (views / line items) ──
  async listViews(modelId: string, workspaceId?: string): Promise<any[]> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.get(`/workspaces/${wid}/models/${modelId}/views`, this.headers);
    return r.data?.views || [];
  }

  async getViewData(viewId: string, modelId: string, workspaceId?: string): Promise<any> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.get(`/workspaces/${wid}/models/${modelId}/views/${viewId}/data`, this.headers);
    return r.data;
  }

  // ── Scenarios ──
  async listScenarios(modelId: string, workspaceId?: string): Promise<any[]> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.get(`/workspaces/${wid}/models/${modelId}/scenarios`, this.headers);
    return r.data?.scenarios || [];
  }

  // ── Forecasts (imports) ──
  async createImport(modelId: string, data: Record<string, unknown>, workspaceId?: string): Promise<any> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.post(`/workspaces/${wid}/models/${modelId}/imports`, data, this.headers);
    return r.data;
  }

  async updateCellData(modelId: string, viewId: string, data: Record<string, unknown>, workspaceId?: string): Promise<any> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.put(
      `/workspaces/${wid}/models/${modelId}/views/${viewId}/data`,
      data,
      this.headers,
    );
    return r.data;
  }

  // ── Actuals vs Budget ──
  async getActualsVsBudget(modelId: string, workspaceId?: string): Promise<any> {
    const wid = workspaceId || this.workspaceId;
    if (!wid) throw new Error("Anaplan workspaceId is required");
    const r = await this.client.get(`/workspaces/${wid}/models/${modelId}/processes`, this.headers);
    return r.data;
  }

  // ── Health ──
  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/workspaces", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createAnaplanClient(config: ConnectionConfig): AnaplanClient {
  const cred: AnaplanCredential = validateAnaplanCredential({
    authToken: config.accessToken || (config.apiKey as string) || (config.authToken as string) || "",
    workspaceId: config.workspaceId as string | undefined,
    modelId: config.modelId as string | undefined,
    user: config.user as string | undefined,
    password: config.password as string | undefined,
  });
  return new AnaplanClient(cred.authToken, cred.workspaceId);
}
