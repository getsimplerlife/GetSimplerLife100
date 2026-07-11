import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class JiraClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private cloudId: string;
  constructor(tokens: OAuthTokens, authConfig: any, cloudId: string) {
    this.client = new HttpClient({ baseUrl: `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3`, rateLimit: { maxRequestsPerSecond: 15 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.cloudId = cloudId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshJiraToken } = await import("./auth"); this.tokens = await refreshJiraToken(this.authConfig, this.tokens.refreshToken); } }

  async searchIssues(jql: string, maxResults = 50): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}`, this.headers); return r.data?.issues || []; }
  async getIssue(issueKey: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/issue/${issueKey}`, this.headers); return r.data; }
  async createIssue(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/issue", { fields: data }, this.headers); return r.data; }
  async updateIssue(issueKey: string, data: any): Promise<void> { await this.ensureToken(); await this.client.put(`/issue/${issueKey}`, { fields: data }, this.headers); }
  async listProjects(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/project", this.headers); return r.data || []; }
  async getProject(projectKey: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/project/${projectKey}`, this.headers); return r.data; }
  async listSprints(boardId: number, state?: string): Promise<any[]> { await this.ensureToken(); const p = state ? `/board/${boardId}/sprint?state=${state}` : `/board/${boardId}/sprint`; const r = await this.client.get(p, this.headers); return r.data?.values || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/myself", this.headers); return r.ok; } catch { return false; } }
}

export function createJiraClient(config: ConnectionConfig): JiraClient {
  return new JiraClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.cloudId || "");
}