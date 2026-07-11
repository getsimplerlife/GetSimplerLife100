import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class ClickUpClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.clickup.com/api/v2", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: this.tokens.accessToken, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshClickUpToken } = await import("./auth"); this.tokens = await refreshClickUpToken(this.authConfig, this.tokens.refreshToken); } }

  async listSpaces(teamId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/team/${teamId}/space`, this.headers); return r.data?.spaces || []; }
  async listFolders(spaceId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/space/${spaceId}/folder`, this.headers); return r.data?.folders || []; }
  async listLists(folderId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/folder/${folderId}/list`, this.headers); return r.data?.lists || []; }
  async listTasks(listId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/list/${listId}/task`, this.headers); return r.data?.tasks || []; }
  async createTask(listId: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/list/${listId}/task`, data, this.headers); return r.data; }
  async getTask(taskId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/task/${taskId}`, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/user", this.headers); return r.ok; } catch { return false; } }
}

export function createClickUpClient(config: ConnectionConfig): ClickUpClient {
  return new ClickUpClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}