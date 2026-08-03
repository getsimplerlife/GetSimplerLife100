import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";

/**
 * Coupa REST API client.
 *
 * Canonical host: https://{instance}.coupahost.com/api — no guessed hosts.
 * Auth: API key in `X-API-KEY` header.
 *
 * Coupa list endpoints return a wrapped object with the resource key; `unwrapList`
 * handles both array and wrapped shapes.
 */
export class CoupaClient {
  private client: HttpClient;
  private apiKey: string;
  private instance: string;

  constructor(apiKey: string, instance: string) {
    this.client = new HttpClient({
      baseUrl: `https://${instance}.coupahost.com/api`,
      rateLimit: { maxRequestsPerSecond: 5 },
      retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
      timeout: 30000,
    });
    this.apiKey = apiKey;
    this.instance = instance;
  }

  private get headers() {
    return {
      "X-API-KEY": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  private unwrapList(data: any, key: string): any[] {
    if (Array.isArray(data)) return data;
    if (!data) return [];
    if (Array.isArray(data[key])) return data[key];
    return [];
  }

  /* ── Understand (read) ── */

  async listPurchaseOrders(params?: Record<string, unknown>): Promise<any[]> {
    const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    const r = await this.client.get(`/purchase_orders${qs}`, this.headers);
    return this.unwrapList(r.data, "purchase_orders");
  }

  async getPurchaseOrder(poId: string): Promise<any> {
    const r = await this.client.get(`/purchase_orders/${poId}`, this.headers);
    return r.data;
  }

  async listSuppliers(): Promise<any[]> {
    const r = await this.client.get("/suppliers", this.headers);
    return this.unwrapList(r.data, "suppliers");
  }

  async listReceipts(params?: Record<string, unknown>): Promise<any[]> {
    const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    const r = await this.client.get(`/receipts${qs}`, this.headers);
    return this.unwrapList(r.data, "receipts");
  }

  async listInvoices(params?: Record<string, unknown>): Promise<any[]> {
    const qs = params ? "?" + new URLSearchParams(params as Record<string, string>).toString() : "";
    const r = await this.client.get(`/invoices${qs}`, this.headers);
    return this.unwrapList(r.data, "invoices");
  }

  async listApprovals(): Promise<any[]> {
    const r = await this.client.get("/approvals", this.headers);
    return this.unwrapList(r.data, "approvals");
  }

  /* ── Monitor ── */

  async listPurchaseOrdersChangedSince(from: string): Promise<any[]> {
    return this.listPurchaseOrders({ "updated-at[gt]": from });
  }

  /* ── Automate (write) ── */

  async createPurchaseOrder(data: Record<string, unknown>): Promise<any> {
    const r = await this.client.post("/purchase_orders", JSON.stringify(data), this.headers);
    return r.data;
  }

  async updatePurchaseOrder(poId: string, data: Record<string, unknown>): Promise<any> {
    const r = await this.client.put(`/purchase_orders/${poId}`, JSON.stringify(data), this.headers);
    return r.data;
  }

  /* ── Health check ── */
  async healthCheck(): Promise<boolean> {
    try {
      const r = await this.client.get("/purchase_orders?limit=1", this.headers);
      return r.ok;
    } catch {
      return false;
    }
  }
}

export function createCoupaClient(config: ConnectionConfig): CoupaClient {
  const apiKey = (config.apiKey as string) || "";
  const instance = (config.instance as string) || (config.subdomain as string) || "";
  if (!apiKey) throw new Error("Coupa credential has no apiKey");
  if (!instance) throw new Error("Coupa credential has no instance");
  return new CoupaClient(apiKey, instance);
}
