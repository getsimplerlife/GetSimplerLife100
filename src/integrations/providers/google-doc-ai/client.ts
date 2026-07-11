import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class DocAIClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any; private processorId: string; private location: string; private projectId: string;
  constructor(tokens: OAuthTokens, authConfig: any, projectId: string, location: string, processorId: string) {
    this.client = new HttpClient({ baseUrl: `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 30000 }, timeout: 120000 });
    this.tokens = tokens; this.authConfig = authConfig; this.projectId = projectId; this.location = location; this.processorId = processorId;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshDocAIToken } = await import("./auth"); this.tokens = await refreshDocAIToken(this.authConfig, this.tokens.refreshToken); } }

  async processDocument(base64Content: string, mimeType = "application/pdf"): Promise<any> { await this.ensureToken(); const r = await this.client.post("", { rawDocument: { content: base64Content, mimeType } }, this.headers); return r.data; }
  async processDocumentUrl(url: string, mimeType = "application/pdf"): Promise<any> { await this.ensureToken(); const r = await this.client.post("", { gcsDocument: { gcsUri: url, mimeType } }, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { return true; } catch { return false; } }
}

export function createDocAIClient(config: ConnectionConfig): DocAIClient {
  return new DocAIClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.projectId || "", config.location || "us", config.processorId || "");
}