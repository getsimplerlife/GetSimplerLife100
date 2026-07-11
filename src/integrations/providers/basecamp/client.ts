import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class BasecampClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private accountId: string;
  constructor(tokens: OAuthTokens, authConfig: any, accountId: string) {
    this.client = new HttpClient({ baseUrl: `https://3.basecampapi.com/${accountId}`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.accountId = accountId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", "User-Agent": "SimplerLife100" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshBasecampToken } = await import("./auth"); this.tokens = await refreshBasecampToken(this.authConfig, this.tokens.refreshToken); } }

  async listProjects(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/projects.json", this.headers); return r.data || []; }
  async getProject(id: number): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/projects/${id}.json`, this.headers); return r.data; }
  async listTodos(projectId: number, todolistId: number): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/buckets/${projectId}/todolists/${todolistId}/todos.json`, this.headers); return r.data || []; }
  async createTodo(projectId: number, todolistId: number, content: string): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/buckets/${projectId}/todolists/${todolistId}/todos.json`, { content }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/projects.json", this.headers); return r.ok; } catch { return false; } }
}

export function createBasecampClient(config: ConnectionConfig): BasecampClient {
  return new BasecampClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.accountId || "");
}