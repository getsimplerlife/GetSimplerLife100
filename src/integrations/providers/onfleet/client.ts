import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Onfleet REST API v2 client.
 *
 * Canonical host: https://onfleet.com/api/v2 — no guessed hosts.
 * Auth: HTTP Basic with the API key as the username and an empty password
 * (`Authorization: Basic base64(apiKey:)`), per Onfleet's API key contract.
 *
 * Onfleet list endpoints return either a bare array or a wrapped object
 * depending on resource; `unwrapList` handles both shapes.
 */
export class OnfleetClient {
  private client: HttpClient;
  private apiKey: string;

  constructor(apiKey: string) {
    this.client = new HttpClient({
      baseUrl: "https://onfleet.com/api/v2",
      rateLimit: { maxRequestsPerSecond: 10 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.apiKey = apiKey;
  }

  private get headers() {
    return {
      Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    };
  }

  private unwrapList(data: any): any[] {
    if (Array.isArray(data)) return data;
    if (!data) return [];
    for (const key of ["tasks", "workers", "teams", "recipients", "destinations", "hubs", "admins", "webhooks"]) {
      if (Array.isArray(data[key])) return data[key];
    }
    return [];
  }

  /* ── Understand (read) ── */

  /** List tasks; optional epoch-ms from/to filter (tasks updated in window). */
  async listTasks(options?: { from?: number; to?: number; state?: number }): Promise<any[]> {
    const params = new URLSearchParams();
    if (options?.from !== undefined) params.set("from", String(options.from));
    if (options?.to !== undefined) params.set("to", String(options.to));
    if (options?.state !== undefined) params.set("state", String(options.state));
    const qs = params.toString();
    const r = await this.client.get(`/tasks${qs ? `?${qs}` : ""}`, this.headers);
    return this.unwrapList(r.data);
  }

  async getTask(taskId: string): Promise<any> {
    const r = await this.client.get(`/tasks/${taskId}`, this.headers);
    return r.data;
  }

  async listWorkers(): Promise<any[]> {
    const r = await this.client.get("/workers", this.headers);
    return this.unwrapList(r.data);
  }

  async getWorker(workerId: string): Promise<any> {
    const r = await this.client.get(`/workers/${workerId}`, this.headers);
    return r.data;
  }

  async listTeams(): Promise<any[]> {
    const r = await this.client.get("/teams", this.headers);
    return this.unwrapList(r.data);
  }

  async getTeam(teamId: string): Promise<any> {
    const r = await this.client.get(`/teams/${teamId}`, this.headers);
    return r.data;
  }

  async listRecipients(): Promise<any[]> {
    const r = await this.client.get("/recipients", this.headers);
    return this.unwrapList(r.data);
  }

  async listDestinations(): Promise<any[]> {
    const r = await this.client.get("/destinations", this.headers);
    return this.unwrapList(r.data);
  }

  async listAdmins(): Promise<any[]> {
    const r = await this.client.get("/admins", this.headers);
    return this.unwrapList(r.data);
  }

  async listHubs(): Promise<any[]> {
    const r = await this.client.get("/hubs", this.headers);
    return this.unwrapList(r.data);
  }

  async listWebhooks(): Promise<any[]> {
    const r = await this.client.get("/webhooks", this.headers);
    return this.unwrapList(r.data);
  }

  async getOrganization(): Promise<any> {
    const r = await this.client.get("/organizations", this.headers);
    return r.data?.organization ?? r.data;
  }

  /** A team/worker container holds the assigned route (its ordered tasks). */
  async getContainer(containerId: string): Promise<any> {
    const r = await this.client.get(`/containers/${containerId}`, this.headers);
    return r.data;
  }

  /* ── Monitor ── */

  /** Tasks updated in the [from, to] epoch-ms window (Onfleet from/to filters). */
  async listTasksChangedSince(from: number, to?: number): Promise<any[]> {
    return this.listTasks({ from, to });
  }

  /* ── Automate (write) ── */

  async createTask(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/tasks", JSON.stringify(data), this.headers);
    return r.data;
  }

  async updateTask(taskId: string, data: Record<string, unknown>): Promise<any> {
    const r = await this.client.put(`/tasks/${taskId}`, JSON.stringify(data), this.headers);
    return r.data;
  }

  async deleteTask(taskId: string): Promise<boolean> {
    const r = await this.client.delete(`/tasks/${taskId}`, this.headers);
    return r.ok;
  }

  async completeTask(taskId: string): Promise<any> {
    const r = await this.client.post(`/tasks/${taskId}/complete`, undefined, this.headers);
    return r.data;
  }

  async createWorker(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/workers", JSON.stringify(data), this.headers);
    return r.data;
  }

  async updateWorker(workerId: string, data: Record<string, unknown>): Promise<any> {
    const r = await this.client.put(`/workers/${workerId}`, JSON.stringify(data), this.headers);
    return r.data;
  }

  async deleteWorker(workerId: string): Promise<boolean> {
    const r = await this.client.delete(`/workers/${workerId}`, this.headers);
    return r.ok;
  }

  async createTeam(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/teams", JSON.stringify(data), this.headers);
    return r.data;
  }

  async createDestination(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/destinations", JSON.stringify(data), this.headers);
    return r.data;
  }

  async createRecipient(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/recipients", JSON.stringify(data), this.headers);
    return r.data;
  }

  async createWebhook(data: { url: string; trigger: string }): Promise<any> {
    const r = await this.client.post("/webhooks", JSON.stringify(data), this.headers);
    return r.data;
  }

  async deleteWebhook(webhookId: string): Promise<boolean> {
    const r = await this.client.delete(`/webhooks/${webhookId}`, this.headers);
    return r.ok;
  }

  /* ── Health check ── */
  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/organizations", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createOnfleetClient(config: ConnectionConfig): OnfleetClient {
  const apiKey = (config.apiKey as string) || (config.apiToken as string) || "";
  if (!apiKey) throw new Error("Onfleet credential has no apiKey");
  return new OnfleetClient(apiKey);
}
