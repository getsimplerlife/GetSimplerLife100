import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class LeverClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://api.lever.co/v1", rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`, "Content-Type": "application/json" }; }

  async listOpportunities(): Promise<any[]> { const r = await this.client.get("/opportunities", this.headers); return r.data?.data || []; }
  async getOpportunity(id: string): Promise<any> { const r = await this.client.get(`/opportunities/${id}`, this.headers); return r.data?.data; }
  async createOpportunity(data: any): Promise<any> { const r = await this.client.post("/opportunities", data, this.headers); return r.data?.data; }
  async listPostings(): Promise<any[]> { const r = await this.client.get("/postings", this.headers); return r.data?.data || []; }
  async getPosting(id: string): Promise<any> { const r = await this.client.get(`/postings/${id}`, this.headers); return r.data?.data; }
  async listCandidates(): Promise<any[]> { const r = await this.client.get("/candidates", this.headers); return r.data?.data || []; }
  async createCandidate(data: any): Promise<any> { const r = await this.client.post("/candidates", data, this.headers); return r.data?.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/opportunities?limit=1", this.headers); return r.ok; } catch { return false; } }
}

export function createLeverClient(config: ConnectionConfig): LeverClient {
  return new LeverClient(config.apiKey || "");
}