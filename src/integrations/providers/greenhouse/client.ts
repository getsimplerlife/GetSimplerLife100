import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class GreenhouseClient {
  private client: HttpClient; private apiKey: string;
  constructor(apiKey: string) {
    this.client = new HttpClient({ baseUrl: "https://harvest.greenhouse.io/v1", rateLimit: { maxRequestsPerSecond: 5 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey;
  }
  private get headers() { return { Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`, "Content-Type": "application/json" }; }

  async listJobs(): Promise<any[]> { const r = await this.client.get("/jobs", this.headers); return r.data || []; }
  async getJob(id: number): Promise<any> { const r = await this.client.get(`/jobs/${id}`, this.headers); return r.data; }
  async listCandidates(limit = 100): Promise<any[]> { const r = await this.client.get(`/candidates?per_page=${limit}`, this.headers); return r.data || []; }
  async getCandidate(id: number): Promise<any> { const r = await this.client.get(`/candidates/${id}`, this.headers); return r.data; }
  async listApplications(jobId: number): Promise<any[]> { const r = await this.client.get(`/jobs/${jobId}/applications`, this.headers); return r.data || []; }
  async createCandidate(data: any): Promise<any> { const r = await this.client.post("/candidates", data, this.headers); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get("/jobs?per_page=1", this.headers); return r.ok; } catch { return false; } }
}

export function createGreenhouseClient(config: ConnectionConfig): GreenhouseClient {
  return new GreenhouseClient(config.apiKey || "");
}