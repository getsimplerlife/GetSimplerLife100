import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class GoogleDriveClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://www.googleapis.com/drive/v3", rateLimit: { maxRequestsPerSecond: 50 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshGDriveToken } = await import("./auth"); this.tokens = await refreshGDriveToken(this.authConfig, this.tokens.refreshToken); } }

  async listFiles(q?: string, pageSize = 100): Promise<any[]> { await this.ensureToken(); const p = q ? `/files?q=${encodeURIComponent(q)}&pageSize=${pageSize}` : `/files?pageSize=${pageSize}`; const r = await this.client.get(p, this.headers); return r.data?.files || []; }
  async getFile(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/files/${id}?supportsAllDrives=true`, this.headers); return r.data; }
  async createFolder(name: string, parentId?: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/files?supportsAllDrives=true", { name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : [] }, this.headers); return r.data; }
  async uploadFile(name: string, content: string, mimeType?: string, parentId?: string): Promise<any> { await this.ensureToken(); const metadata: any = { name, parents: parentId ? [parentId] : [] }; if (mimeType) metadata.mimeType = mimeType; const r = await this.client.post("/files?supportsAllDrives=true&uploadType=multipart", { ...metadata, content }, this.headers); return r.data; }
  async exportFile(fileId: string, mimeType: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`, this.headers); return r.data; }
  async getPermissions(fileId: string): Promise<any[]> { await this.ensureToken(); const r = await this.client.get(`/files/${fileId}/permissions`, this.headers); return r.data?.permissions || []; }
  async searchFiles(query: string): Promise<any[]> { return this.listFiles(`name contains '${query}'`); }
  async getAbout(): Promise<any> { await this.ensureToken(); const r = await this.client.get("/about?fields=*", this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/about?fields=user", this.headers); return r.ok; } catch { return false; } }
}

export function createGDriveClient(config: ConnectionConfig): GoogleDriveClient {
  return new GoogleDriveClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}