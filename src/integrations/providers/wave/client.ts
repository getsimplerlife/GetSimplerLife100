import { HttpClient } from "../../framework/client"; import { OAuthTokens, isTokenExpired } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class WaveClient {
  private client: HttpClient; private tokens: OAuthTokens; private authConfig: any;
  constructor(tokens: OAuthTokens, authConfig: any) {
    this.client = new HttpClient({ baseUrl: "https://api.waveapps.com/business", rateLimit: { maxRequestsPerSecond: 20 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.tokens = tokens; this.authConfig = authConfig;
  }
  private get headers() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "Content-Type": "application/json" }; }
  private async ensureToken() { if (isTokenExpired(this.tokens) && this.tokens.refreshToken) { const { refreshWaveToken } = await import("./auth"); this.tokens = await refreshWaveToken(this.authConfig, this.tokens.refreshToken); } }

  async query(graphql: string): Promise<any> { await this.ensureToken(); const r = await this.client.post("/graphql", { query: graphql }, this.headers); return r.data; }
  async list(entity: string): Promise<any[]> {
    const q = `query { ${entity} { edges { node { id name } } } }`;
    const r = await this.query(q);
    return r?.data?.[entity]?.edges?.map((e: any) => e.node) || [];
  }
  async healthCheck(): Promise<boolean> { try { const r = await this.query("query { businesses { edges { node { id } } } }"); return !!r?.data; } catch { return false; } }
}

export function createWaveClient(config: ConnectionConfig): WaveClient {
  return new WaveClient({ accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config },
    { clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" });
}