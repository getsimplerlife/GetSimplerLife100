import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class BoxClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.box.com/2.0", rateLimit: { maxRequestsPerSecond: 15 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshBoxToken } = await import("./auth"); this.tokens = await refreshBoxToken(this.authConfig, this.tokens.refreshToken); } }

  async listFolder(folderId = "0"): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/folders/${folderId}/items`, this.headers); return r.data; }
  async getFolder(folderId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/folders/${folderId}`, this.headers); return r.data; }
  async getFile(fileId: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/files/${fileId}`, this.headers); return r.data; }
  async createFolder(name: string, parentId = "0"): Promise<any> { await this.ensureToken(); const r = await this.client.post("/folders", { name, parent: { id: parentId } }, this.headers); return r.data; }
  async searchFiles(query: string, limit = 50): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/search?query=${encodeURIComponent(query)}&limit=${limit}`, this.headers); return r.data; }
  async createSharedLink(id: string, type: "file" | "folder"): Promise<any> { await this.ensureToken(); const r = await this.client.put(`/${type}s/${id}`, { shared_link: { access: "open" } }, this.headers); return r.data; }
  async getCurrentUser(): Promise<any> { await this.ensureToken(); const r = await this.client.get("/users/me", this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/users/me", this.headers); return r.ok; } catch { return false; } }
}

export function createBoxClient(config: ConnectionConfig): BoxClient {
  return new BoxClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}