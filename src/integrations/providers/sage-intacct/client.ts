import { HttpClient } from "../../framework/client"; import { OAuthTokens } from "../../framework/oauth"; import { ConnectionConfig } from "../../framework/connection";

export class IntacctClient {
  private token: string; private companyId: string; private entityId: string; private baseUrl: string;
  constructor(token: string, companyId: string, entityId: string) {
    this.baseUrl = "https://api.intacct.com/ia/api/v2";
    this.token = token; this.companyId = companyId; this.entityId = entityId;
  }
  private get headers() { return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", "X-CompanyId": this.companyId, "X-EntityId": this.entityId || "DEFAULT" }; }

  async call(functionName: string, data: any): Promise<any> {
    const r = await fetch(`${this.baseUrl}/${functionName}`, { method: "POST", headers: this.headers, body: JSON.stringify(data) });
    return r.json();
  }
  async list(type: string, filter?: string): Promise<any[]> {
    const r = await fetch(`${this.baseUrl}/${type}${filter ? `?$filter=${encodeURIComponent(filter)}` : ""}`, { method: "GET", headers: this.headers });
    const d = await r.json(); return d?.data || d || [];
  }
  async create(type: string, data: any): Promise<any> {
    const r = await fetch(`${this.baseUrl}/${type}`, { method: "POST", headers: this.headers, body: JSON.stringify(data) });
    return r.json();
  }
  async healthCheck(): Promise<boolean> {
    try { const r = await fetch(`${this.baseUrl}/Company?$top=1`, { headers: this.headers }); return r.ok; } catch { return false; }
  }
}

export function createIntacctClient(config: ConnectionConfig): IntacctClient {
  return new IntacctClient(config.accessToken || "", config.companyId || "", config.entityId || "");
}