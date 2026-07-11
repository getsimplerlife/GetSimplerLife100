import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class AircallClient {
  private client: HttpClient; private apiKey: string; private apiSecret: string;
  constructor(apiKey: string, apiSecret: string) {
    this.client = new HttpClient({ baseUrl: "https://api.aircall.io/v1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey; this.apiSecret = apiSecret;
  }
  private get headers() { const basic = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString("base64"); return { Authorization: `Basic ${basic}`, "Content-Type": "application/json" }; }

  async listCalls(limit = 50): Promise<any[]> { const r = await this.client.get(`/calls?per_page=${limit}`, this.headers); return r.data?.calls || []; }
  async getCall(callId: number): Promise<any> { const r = await this.client.get(`/calls/${callId}`, this.headers); return r.data?.call; }
  async listContacts(limit = 50): Promise<any[]> { const r = await this.client.get(`/contacts?per_page=${limit}`, this.headers); return r.data?.contacts || []; }
  async createContact(data: any): Promise<any> { const r = await this.client.post("/contacts", data, this.headers); return r.data?.contact; }
  async listUsers(limit = 50): Promise<any[]> { const r = await this.client.get(`/users?per_page=${limit}`, this.headers); return r.data?.users || []; }
  async listNumbers(limit = 50): Promise<any[]> { const r = await this.client.get(`/numbers?per_page=${limit}`, this.headers); return r.data?.numbers || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/calls?per_page=1", this.headers); return r.ok; } catch { return false; } }
}

export function createAircallClient(config: ConnectionConfig): AircallClient {
  return new AircallClient(config.apiKey || "", config.apiSecret || "");
}