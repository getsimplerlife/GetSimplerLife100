import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Tableau REST API client (API version 3.x).
 *
 * Canonical endpoint shape (no guessed hosts): `{serverUrl}/api/{apiVersion}/sites/{siteId}/...`
 * where serverUrl is the tenant's Tableau Server/Cloud host (e.g. https://prod-useast-b.online.tableau.com).
 * Authentication is a personal access token (PAT) sent as `X-Tableau-Auth`.
 */
export class TableauClient {
  private client: HttpClient;
  private pat: string;
  private siteId: string;

  constructor(personalAccessToken: string, serverUrl: string, siteId: string, apiVersion = "3.18") {
    this.client = new HttpClient({
      baseUrl: `${serverUrl.replace(/\/$/, "")}/api/${apiVersion}`,
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.pat = personalAccessToken;
    this.siteId = siteId;
  }

  private get headers() {
    return { "X-Tableau-Auth": this.pat, "Content-Type": "application/json" };
  }

  /* ── Understand (read) ── */

  async listWorkbooks(limit = 1000): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/workbooks?pageSize=${limit}`, this.headers);
    return r.data?.workbooks?.workbook || [];
  }

  async getWorkbook(workbookId: string): Promise<any> {
    const r = await this.client.get(`/sites/${this.siteId}/workbooks/${workbookId}`, this.headers);
    return r.data?.workbook;
  }

  async listDatasources(limit = 1000): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/datasources?pageSize=${limit}`, this.headers);
    return r.data?.datasources?.datasource || [];
  }

  async getDatasource(datasourceId: string): Promise<any> {
    const r = await this.client.get(`/sites/${this.siteId}/datasources/${datasourceId}`, this.headers);
    return r.data?.datasource;
  }

  async listProjects(limit = 1000): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/projects?pageSize=${limit}`, this.headers);
    return r.data?.projects?.project || [];
  }

  async getProject(projectId: string): Promise<any> {
    const r = await this.client.get(`/sites/${this.siteId}/projects/${projectId}`, this.headers);
    return r.data?.project;
  }

  async listUsers(limit = 1000): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/users?pageSize=${limit}`, this.headers);
    return r.data?.users?.user || [];
  }

  async getUser(userId: string): Promise<any> {
    const r = await this.client.get(`/sites/${this.siteId}/users/${userId}`, this.headers);
    return r.data?.user;
  }

  /** Views (reports). Tableau does not separate "reports" — views are worksheets/dashboards. */
  async listViews(limit = 1000): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/views?pageSize=${limit}`, this.headers);
    return r.data?.views?.view || [];
  }

  /** Dashboards are views whose sheetType is "dashboard". */
  async listDashboards(limit = 1000): Promise<any[]> {
    const r = await this.client.get(
      `/sites/${this.siteId}/views?pageSize=${limit}&filter=${encodeURIComponent("sheetType:eq:dashboard")}`,
      this.headers,
    );
    return r.data?.views?.view || [];
  }

  async listWorkbookConnections(workbookId: string): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/workbooks/${workbookId}/connections`, this.headers);
    return r.data?.connections?.connection || [];
  }

  async listDatasourceConnections(datasourceId: string): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/datasources/${datasourceId}/connections`, this.headers);
    return r.data?.connections?.connection || [];
  }

  async listSchedules(limit = 1000): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/schedules?pageSize=${limit}`, this.headers);
    return r.data?.schedules?.schedule || [];
  }

  async listFlows(limit = 1000): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/flows?pageSize=${limit}`, this.headers);
    return r.data?.flows?.flow || [];
  }

  /* ── Monitor ── */

  /** Workbooks updated at or after an ISO timestamp (Tableau filter: updatedAt:gte). */
  async listWorkbooksChangedSince(fromDate: string): Promise<any[]> {
    const r = await this.client.get(
      `/sites/${this.siteId}/workbooks?pageSize=1000&filter=${encodeURIComponent(`updatedAt:gte:${fromDate}`)}`,
      this.headers,
    );
    return r.data?.workbooks?.workbook || [];
  }

  /** Datasources updated at or after an ISO timestamp (Tableau filter: lastUpdatedAt:gte). */
  async listDatasourcesChangedSince(fromDate: string): Promise<any[]> {
    const r = await this.client.get(
      `/sites/${this.siteId}/datasources?pageSize=1000&filter=${encodeURIComponent(`lastUpdatedAt:gte:${fromDate}`)}`,
      this.headers,
    );
    return r.data?.datasources?.datasource || [];
  }

  /** Refresh jobs for a datasource (monitor refresh/extract status). */
  async listDatasourceRefreshes(datasourceId: string): Promise<any[]> {
    const r = await this.client.get(`/sites/${this.siteId}/datasources/${datasourceId}/refreshes`, this.headers);
    return r.data?.jobs?.job || [];
  }

  /* ── Automate (write) ── */

  async createProject(data: { name: string; description?: string; parentProjectId?: string }): Promise<any> {
    const r = await this.client.post(`/sites/${this.siteId}/projects`, JSON.stringify({ project: data }), this.headers);
    return r.data?.project;
  }

  async updateProject(projectId: string, data: { name?: string; description?: string }): Promise<any> {
    const r = await this.client.put(`/sites/${this.siteId}/projects/${projectId}`, JSON.stringify({ project: data }), this.headers);
    return r.data?.project;
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const r = await this.client.delete(`/sites/${this.siteId}/projects/${projectId}`, this.headers);
    return r.ok;
  }

  async addSiteUser(data: { name: string; siteRole?: string; authSetting?: string }): Promise<any> {
    const r = await this.client.post(
      `/sites/${this.siteId}/users`,
      JSON.stringify({ user: { name: data.name, siteRole: data.siteRole || "Viewer", authSetting: data.authSetting || "OpenID" } }),
      this.headers,
    );
    return r.data?.user;
  }

  async removeSiteUser(userId: string): Promise<boolean> {
    const r = await this.client.delete(`/sites/${this.siteId}/users/${userId}`, this.headers);
    return r.ok;
  }

  async updateWorkbook(workbookId: string, data: { name?: string; showTabs?: boolean }): Promise<any> {
    const r = await this.client.put(`/sites/${this.siteId}/workbooks/${workbookId}`, JSON.stringify({ workbook: data }), this.headers);
    return r.data?.workbook;
  }

  /** Starts an extract refresh job for a datasource. Safe mutating write (no data change). */
  async refreshDatasource(datasourceId: string): Promise<any> {
    const r = await this.client.post(`/sites/${this.siteId}/datasources/${datasourceId}/refresh`, undefined, this.headers);
    return r.data?.job;
  }

  /* ── Health check ── */
  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get(`/sites/${this.siteId}/workbooks?pageSize=1`, this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createTableauClient(config: ConnectionConfig): TableauClient {
  const serverUrl = (config.serverUrl as string) || (config.instanceUrl as string) || "";
  if (!serverUrl) throw new Error("Tableau credential has no serverUrl — configure the tenant Tableau Server/Cloud host");
  return new TableauClient(
    (config.pat as string) || (config.apiToken as string) || "",
    serverUrl,
    (config.siteId as string) || (config.site as string) || "",
    (config.apiVersion as string) || "3.18",
  );
}
