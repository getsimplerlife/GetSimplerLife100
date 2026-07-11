import { HttpClient } from "../../framework/client";
import { OAuthTokens, isTokenExpired } from "../../framework/oauth";
import { ConnectionConfig } from "../../framework/connection";

interface DynEntity {
  accountid?: string; contactid?: string; opportunityid?: string; leadid?: string;
  fullname?: string; firstname?: string; lastname?: string; emailaddress1?: string;
  telephone1?: string; jobtitle?: string; name?: string; revenue?: number;
  [key: string]: any;
}

export class DynamicsClient {
  private client: HttpClient;
  private tokens: OAuthTokens;
  private authConfig: any;
  private apiUrl: string;

  constructor(tokens: OAuthTokens, authConfig: any, apiUrl: string) {
    this.apiUrl = apiUrl.replace(/\/+$/, "") + "/api/data/v9.2";
    this.client = new HttpClient({
      baseUrl: this.apiUrl,
      rateLimit: { maxRequestsPerSecond: 60 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.tokens = tokens;
    this.authConfig = authConfig;
  }

  private get authHeaders() { return { Authorization: `Bearer ${this.tokens.accessToken}`, "OData-MaxVersion": "4.0", Prefer: 'odata.include-annotations="*"' }; }

  private async ensureToken() {
    if (isTokenExpired(this.tokens) && this.tokens.refreshToken) {
      const { refreshDynamicsToken } = await import("./auth");
      this.tokens = await refreshDynamicsToken(this.authConfig, this.tokens.refreshToken);
    }
  }

  async search(entitySet: string, query: string): Promise<DynEntity[]> {
    await this.ensureToken();
    const res = await this.client.get<any>(`/${entitySet}?$filter=contains(${query})&$top=50`, this.authHeaders);
    return res.data?.value || [];
  }

  async create(entitySet: string, data: any): Promise<string> {
    await this.ensureToken();
    const res = await this.client.post(`/${entitySet}`, data, this.authHeaders);
    const id = res.headers.get("OData-EntityId") || "";
    return id.split("(")[1]?.split(")")[0] || id;
  }

  async get(entitySet: string, id: string): Promise<DynEntity> {
    await this.ensureToken();
    const res = await this.client.get(`/${entitySet}(${id})`, this.authHeaders);
    return res.data;
  }

  async update(entitySet: string, id: string, data: any): Promise<void> {
    await this.ensureToken();
    await this.client.patch(`/${entitySet}(${id})`, data, this.authHeaders);
  }

  async searchContacts(query: string) { return this.search("contacts", `fullname,'${query}')`); }
  async createContact(data: any) { return this.create("contacts", data); }
  async getContact(id: string) { return this.get("contacts", id); }
  async searchAccounts(query: string) { return this.search("accounts", `name,'${query}')`); }
  async createAccount(data: any) { return this.create("accounts", data); }
  async searchLeads(query: string) { return this.search("leads", `fullname,'${query}')`); }
  async createLead(data: any) { return this.create("leads", data); }
  async searchOpportunities(query: string) { return this.search("opportunities", `name,'${query}')`); }
  async createOpportunity(data: any) { return this.create("opportunities", data); }

  async healthCheck(): Promise<boolean> {
    try { const res = await this.client.get("/WhoAmI", this.authHeaders); return res.ok; } catch { return false; }
  }
}

export function createDynamicsClient(config: ConnectionConfig): DynamicsClient {
  return new DynamicsClient(
    { accessToken: config.accessToken || "", refreshToken: config.refreshToken, expiresAt: config.expiresAt, scope: config.scope, raw: config, instanceUrl: config.instanceUrl },
    { tenantId: config.tenantId || "", clientId: config.clientId || "", clientSecret: config.clientSecret || "", redirectUri: config.redirectUri || "" },
    config.instanceUrl || `https://${config.tenantId}.crm.dynamics.com`,
  );
}