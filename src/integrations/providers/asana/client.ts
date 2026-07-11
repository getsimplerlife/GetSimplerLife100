import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class AsanaClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://app.asana.com/api/1.0", rateLimit: { maxRequestsPerSecond: 15 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshAsanaToken } = await import("./auth"); this.tokens = await refreshAsanaToken(this.authConfig, this.tokens.refreshToken); } }

  async listWorkspaces(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/workspaces", this.headers); return r.data?.data || []; }
  async listProjects(workspace?: string): Promise<any[]> { await this.ensureToken(); const p = workspace ? `/projects?workspace=${workspace}` : "/projects"; const r = await this.client.get(p, this.headers); return r.data?.data || []; }
  async createProject(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/projects", { data }, this.headers); return r.data?.data; }
  async listTasks(projectId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/projects/${projectId}/tasks`, this.headers); return r.data?.data || []; }
  async createTask(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/tasks", { data }, this.headers); return r.data?.data; }
  async getTask(taskId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/tasks/${taskId}`, this.headers); return r.data?.data; }
  async updateTask(taskId: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/tasks/${taskId}`, { data }, this.headers); return r.data?.data; }
  async listUsers(workspace: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/users?workspace=${workspace}`, this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/users/me", this.headers); return r.ok; } catch { return false; } }
}

export function createAsanaClient(config: ConnectionConfig): AsanaClient {
  return new AsanaClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}