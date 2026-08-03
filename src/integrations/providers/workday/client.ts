import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";

export class WorkdayClient {
  private client: HttpClient;
  private token: string;
  private tenant: string;

  constructor(token: string, tenant: string) {
    this.client = new HttpClient({
      baseUrl: `https://${tenant}.myworkday.com/api/v1`,
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.token = token;
    this.tenant = tenant;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" };
  }

  /* ── Workers (employees) ── */
  async listWorkers(limit?: number): Promise<any[]> {
    const r = await this.client.get(`/workers?limit=${limit ?? 50}`, this.headers);
    return r.data?.data || [];
  }

  async getWorker(id: string): Promise<any> {
    const r = await this.client.get(`/workers/${id}`, this.headers);
    return r.data;
  }

  /* ── Organizations ── */
  async listOrganizations(): Promise<any[]> {
    const r = await this.client.get("/organizations", this.headers);
    return r.data?.data || [];
  }

  /* ── Positions ── */
  async listPositions(limit?: number): Promise<any[]> {
    const r = await this.client.get(`/positions?limit=${limit ?? 50}`, this.headers);
    return r.data?.data || [];
  }

  async getPosition(id: string): Promise<any> {
    const r = await this.client.get(`/positions/${id}`, this.headers);
    return r.data;
  }

  /* ── Time-off ── */
  async listTimeOffPlans(): Promise<any[]> {
    const r = await this.client.get("/timeOffPlans", this.headers);
    return r.data?.data || [];
  }

  async getTimeOffBalance(workerId: string): Promise<any> {
    const r = await this.client.get(`/workers/${workerId}/timeOffBalances`, this.headers);
    return r.data;
  }

  /* ── Job Requisitions ── */
  async listJobRequisitions(limit?: number): Promise<any[]> {
    const r = await this.client.get(`/jobRequisitions?limit=${limit ?? 50}`, this.headers);
    return r.data?.data || [];
  }

  /* ── Writes ── */
  async createJobRequisition(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/jobRequisitions", JSON.stringify(data), this.headers);
    return r.data;
  }

  async updateWorker(id: string, data: Record<string, unknown>): Promise<any> {
    const r = await this.client.patch(`/workers/${id}`, JSON.stringify(data), this.headers);
    return r.data;
  }

  async initiateOnboarding(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/onboarding", JSON.stringify(data), this.headers);
    return r.data;
  }

  /* ── Health check ── */
  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/workers?limit=1", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createWorkdayClient(config: ConnectionConfig): WorkdayClient {
  return new WorkdayClient(
    (config.accessToken as string) || (config.token as string) || "",
    (config.tenant as string) || (config.subdomain as string) || "",
  );
}
