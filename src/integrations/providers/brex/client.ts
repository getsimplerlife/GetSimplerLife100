import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class BrexClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://platform.brexapis.com/v2", rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }; }

  async listTransactions(filter?: string): Promise<any[]> { const p = filter ? `/transactions?${filter}` : "/transactions"; const r = await this.client.get(p, this.headers); return r.data?.items || []; }
  async getTransaction(id: string): Promise<any> { const r = await this.client.get(`/transactions/${id}`, this.headers); return r.data; }
  async listAccounts(): Promise<any[]> { const r = await this.client.get("/accounts", this.headers); return r.data?.items || []; }
  async listCards(): Promise<any[]> { const r = await this.client.get("/cards", this.headers); return r.data?.items || []; }
  async createCard(data: any): Promise<any> { const r = await this.client.post("/cards", data, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/accounts", this.headers); return r.ok; } catch { return false; } }
}

export function createBrexClient(config: ConnectionConfig): BrexClient {
  return new BrexClient(config.apiKey || "");
}