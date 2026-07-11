import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class DropboxClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.dropboxapi.com/2", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshDropboxToken } = await import("./auth"); this.tokens = await refreshDropboxToken(this.authConfig, this.tokens.refreshToken); } }

  async listFolder(path = ""): Promise<any> { await this.ensureToken(); const r = await this.client.post("/files/list_folder", { path: path || "", recursive: false }, this.headers); return r.data; }
  async listFolderContinue(cursor: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/files/list_folder/continue", { cursor }, this.headers); return r.data; }
  async getMetadata(path: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/files/get_metadata", { path }, this.headers); return r.data; }
  async createFolder(path: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/files/create_folder_v2", { path }, this.headers); return r.data; }
  async searchFiles(query: string, limit = 50): Promise<any> { await this.ensureToken(); const r = await this.client.post("/files/search_v2", { query, max_results: limit }, this.headers); return r.data; }
  async createShareLink(path: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/sharing/create_shared_link_with_settings", { path, settings: { access: "viewer" } }, this.headers); return r.data; }
  async getAccountInfo(): Promise<any> { await this.ensureToken(); const r = await this.client.post("/users/get_current_account", {}, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.post("/users/get_current_account", {}, this.headers); return r.ok; } catch { return false; } }
}

export function createDropboxClient(config: ConnectionConfig): DropboxClient {
  return new DropboxClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { appKey: config.appKey || "", appSecret: config.appSecret || "", redirectUri: config.redirectUri || "" });
}