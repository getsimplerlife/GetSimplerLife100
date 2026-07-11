import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class SAPS4Client {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any, baseUrl: string) {
    this.client = new HttpClient({ baseUrl: `${baseUrl.replace(/\/+$/, "")}/sap/opu/odata/sap`, rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 2000, maxDelay: 15000 }, timeout: 60000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json", Accept: "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshSAPToken } = await import("./auth"); this.tokens = await refreshSAPToken(this.authConfig, this.tokens.refreshToken); } }

  async get(entitySet: string, id?: string): Promise<any> { await this.ensureToken(); const path = id ? `/${entitySet}('${id}')` : `/${entitySet}`; const r = await this.client.get(path, this.headers); return r.data?.d?.results || r.data?.d || r.data; }
  async list(entitySet: string, filter?: string): Promise<any[]> {
    await this.ensureToken();
    const path = filter ? `/${entitySet}?$filter=${encodeURIComponent(filter)}&$top=100` : `/${entitySet}?$top=100`;
    const r = await this.client.get(path, this.headers);
    return r.data?.d?.results || r.data?.value || [];
  }
  async create(entitySet: string, data: any): Promise<any> { await this.ensureToken(); const r = await this.client.post(`/${entitySet}`, data, this.headers); return r.data?.d || r.data; }
  async update(entitySet: string, id: string, data: any): Promise<void> { await this.ensureToken(); await this.client.patch(`/${entitySet}('${id}')`, data, { ...this.headers, "Content-Type": "application/json", "X-HTTP-Method": "MERGE" }); }

  async healthCheck(): Promise<boolean> {
    try { const r = await this.client.get("/API_BUSINESS_PARTNER/A_BusinessPartner?$top=1", this.headers); return r.ok; } catch { return false; }
  }
}

export function createSAPS4Client(config: ConnectionConfig): SAPS4Client {
  return new SAPS4Client({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "", authUrl: config.authUrl || "", tokenUrl: config.tokenUrl || "" },
    config.baseUrl || "");
}