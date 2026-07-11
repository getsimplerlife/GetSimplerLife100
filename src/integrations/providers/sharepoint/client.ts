import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class SharePointClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private siteId: string;
  constructor(tokens: OAuthTokens, authConfig: any, siteId: string) {
    this.client = new HttpClient({ baseUrl: `https://graph.microsoft.com/v1.0/sites/${siteId}`, rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.siteId = siteId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshOutlookToken } = await import("../outlook/auth"); this.tokens = await refreshOutlookToken(this.authConfig, this.tokens.refreshToken); } }

  async listDrives(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/drives", this.headers); return r.data?.value || []; }
  async listItems(driveId: string, folderId?: string): Promise<any[]> { await this.ensureToken(); const p = folderId ? `/drives/${driveId}/items/${folderId}/children` : `/drives/${driveId}/root/children`; const r = await this.client.get(p, this.headers); return r.data?.value || []; }
  async getItem(driveId: string, itemId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/drives/${driveId}/items/${itemId}`, this.headers); return r.data; }
  async uploadFile(driveId: string, path: string, content: ArrayBuffer): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/drives/${driveId}/root:/${encodeURI(path)}:/content`, content, this.headers); return r.data; }
  async listLists(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/lists", this.headers); return r.data?.value || []; }
  async listItemsInList(listId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/lists/${listId}/items?expand=fields`, this.headers); return r.data?.value || []; }
  async searchFiles(query: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/drive/root/search(q='${encodeURIComponent(query)}')`, this.headers); return r.data?.value || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/drives?$top=1", this.headers); return r.ok; } catch { return false; } }
}

export function createSPClient(config: ConnectionConfig): SharePointClient {
  return new SharePointClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.siteId || "");
}