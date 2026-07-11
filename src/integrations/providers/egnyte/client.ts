import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class EgnyteClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private domain: string;
  constructor(tokens: OAuthTokens, authConfig: any, domain: string) {
    this.client = new HttpClient({ baseUrl: `https://${domain}.egnyte.com/pubapi/v1`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig; this.domain = domain;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshEgnyteToken } = await import("./auth"); this.tokens = await refreshEgnyteToken(this.authConfig, this.tokens.refreshToken); } }

  async listFolder(path: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/fs${path}?list=true`, this.headers); return r.data; }
  async getFile(path: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/fs${path}`, this.headers); return r.data; }
  async createFolder(path: string): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/fs${path}`, { action: "add_folder" }, this.headers); return r.data; }
  async createShareLink(path: string, type = "view"): Promise<any> { await this.ensureToken(); const r = await this.client.post("/links", { path, type, notify: false }, this.headers); return r.data; }
  async searchFiles(query: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/fs/search?query=${encodeURIComponent(query)}`, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/fs/Shared?list=true", this.headers); return r.ok; } catch { return false; } }
}

export function createEgnyteClient(config: ConnectionConfig): EgnyteClient {
  return new EgnyteClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", domain: config.domain },
    config.domain || "");
}