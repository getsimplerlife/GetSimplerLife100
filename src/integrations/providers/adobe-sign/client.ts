import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class AdobeSignClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.na1.echosign.com/api/rest/v6", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshAdobeSignToken } = await import("./auth"); this.tokens = await refreshAdobeSignToken(this.authConfig, this.tokens.refreshToken); } }

  async listAgreements(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/agreements", this.headers); return r.data?.agreementList || []; }
  async sendAgreement(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/agreements", data, this.headers); return r.data; }
  async getAgreement(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/agreements/${id}`, this.headers); return r.data; }
  async downloadAgreement(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/agreements/${id}/combinedDocument`, this.headers); return r.data; }
  async listWebhooks(): Promise<any[]> { await this.ensureToken(); const r = await this.client.get("/webhooks", this.headers); return r.data?.webhookList || []; }
  async createWebhook(data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post("/webhooks", data, this.headers); return r.data; }
  async getAgreementStatus(id: string): Promise<any> { await this.ensureToken(); const r = await this.client.get(`/agreements/${id}`, this.headers); return r.data?.status; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/agreements?pageSize=1", this.headers); return r.ok; } catch { return false; } }
}

export function createAdobeSignClient(config: ConnectionConfig): AdobeSignClient {
  return new AdobeSignClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}