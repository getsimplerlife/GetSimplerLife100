import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class RampClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.ramp.com/developer/v1", rateLimit: { maxRequestsPerSecond: 30 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" }; }

  async listTransactions(filter?: string): Promise<any[]> { const p = filter ? `/transactions?${filter}` : "/transactions?limit=100"; const r = await this.client.get(p, this.headers); return r.data?.data || []; }
  async getTransaction(id: string): Promise<any> { const r = await this.client.get(`/transactions/${id}`, this.headers); return r.data; }
  async listCards(): Promise<any[]> { const r = await this.client.get("/cards", this.headers); return r.data?.data || []; }
  async listReceipts(transactionId: string): Promise<any[]> { const r = await this.client.get(`/receipts?transaction_id=${transactionId}`, this.headers); return r.data?.data || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/transactions?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createRampClient(config: ConnectionConfig): RampClient {
  return new RampClient(config.apiKey || "");
}