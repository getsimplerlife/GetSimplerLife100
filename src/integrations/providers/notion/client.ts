import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class NotionClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.notion.com/v1", rateLimit: { maxRequestsPerSecond: 3 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", "Notion-Version": "2022-06-28" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshNotionToken } = await import("./auth"); this.tokens = await refreshNotionToken(this.authConfig, this.tokens.refreshToken); } }

  async listUsers(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/users", this.headers); return r.data?.results || []; }
  async search(query: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.post("/search", { query }, this.headers); return r.data?.results || []; }
  async queryDatabase(databaseId: string, filter?: any): Promise<any[]> { await this.ensureToken(); const r = await this.client.post(`/databases/${databaseId}/query`, filter || {}, this.headers); return r.data?.results || []; }
  async getPage(pageId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/pages/${pageId}`, this.headers); return r.data; }
  async createPage(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/pages", data, this.headers); return r.data; }
  async updatePage(pageId: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.patch(`/pages/${pageId}`, data, this.headers); return r.data; }
  async getDatabase(databaseId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/databases/${databaseId}`, this.headers); return r.data; }
  async getBlocks(blockId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/blocks/${blockId}/children`, this.headers); return r.data?.results || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/users", this.headers); return r.ok; } catch { return false; } }
}

export function createNotionClient(config: ConnectionConfig): NotionClient {
  return new NotionClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}