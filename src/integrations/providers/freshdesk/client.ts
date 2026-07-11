import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class FreshdeskClient {
  private client: HttpClient;
  constructor(apiKey: string, domain: string) {
    this.client = new HttpClient({ baseUrl: `https://${domain}.freshdesk.com/api/v2`, rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.apiKey}:X`).toString("base64")}`, "Content-Type": "application/json" }; }
  private apiKey = "";

  async listTickets(): Promise<any[]> { const r = await this.client.get("/tickets", this.headers); return r.data || []; }
  async getTicket(id: number): Promise<any> { const r = await this.client.get(`/tickets/${id}`, this.headers); return r.data; }
  async createTicket(data: any): Promise<any> { const r = await this.client.post("/tickets", data, this.headers); return r.data; }
  async listContacts(): Promise<any[]> { const r = await this.client.get("/contacts", this.headers); return r.data || []; }
  async searchContacts(query: string): Promise<any[]> { const r = await this.client.get(`/search/contacts?query="${encodeURIComponent(query)}"`, this.headers); return r.data?.results || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/tickets?per_page=1", this.headers); return r.ok; } catch { return false; } }
}

export function createFreshdeskClient(config: ConnectionConfig): FreshdeskClient {
  const c = new FreshdeskClient(config.apiKey || "", config.domain || "");
  c.apiKey = config.apiKey || "";
  return c;
}