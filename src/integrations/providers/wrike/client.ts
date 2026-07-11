import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class WrikeClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://www.wrike.com/api/v4", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshWrikeToken } = await import("./auth"); this.tokens = await refreshWrikeToken(this.authConfig, this.tokens.refreshToken); } }

  async listFolders(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/folders", this.headers); return r.data?.data || []; }
  async listProjects(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/folders?types=Project", this.headers); return r.data?.data || []; }
  async listTasks(folderId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/folders/${folderId}/tasks`, this.headers); return r.data?.data || []; }
  async createTask(folderId: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/folders/${folderId}/tasks`, data, this.headers); return r.data?.data?.[0]; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/account", this.headers); return r.ok; } catch { return false; } }
}

export function createWrikeClient(config: ConnectionConfig): WrikeClient {
  return new WrikeClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}