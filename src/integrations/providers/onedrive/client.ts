import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class OneDriveClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://graph.microsoft.com/v1.0/me/drive", rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshODToken } = await import("./auth"); this.tokens = await refreshODToken(this.authConfig, this.tokens.refreshToken); } }

  async listRootItems(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/root/children", this.headers); return r.data?.value || []; }
  async listItems(folderId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/items/${folderId}/children`, this.headers); return r.data?.value || []; }
  async getItem(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/items/${id}`, this.headers); return r.data; }
  async getItemByPath(path: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/root:/${encodeURI(path)}`, this.headers); return r.data; }
  async createFolder(name: string, parentId?: string): Promise<any> { await this.ensureToken(); const p = parentId ? `/items/${parentId}/children` : "/root/children"; const r = await this.client.post(p, { name, folder: {}, "@microsoft.graph.conflictBehavior": "rename" }, this.headers); return r.data; }
  async uploadFile(path: string, content: any): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/root:/${encodeURI(path)}:/content`, content, this.headers); return r.data; }
  async searchFiles(query: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/root/search(q='${encodeURIComponent(query)}')`, this.headers); return r.data?.value || []; }
  async createShareLink(id: string, type = "view"): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/items/${id}/createLink`, { type }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/root", this.headers); return r.ok; } catch { return false; } }
}

export function createODClient(config: ConnectionConfig): OneDriveClient {
  return new OneDriveClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}