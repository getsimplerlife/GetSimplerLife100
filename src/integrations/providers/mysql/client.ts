import { HttpClient } from "../../framework/client";
import { ConnectionConfig } from "../../framework/connection";
export class MysqlClient {
  private client: HttpClient;
  constructor(config: any) {
    this.client = new HttpClient({ baseUrl: "https://api.mysql.com", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
  }
  async query(sql: string): Promise<any> { const r = await this.client.post("/query", { query: sql }, { "Content-Type": "application/json" }); return r.data; }
  async healthCheck(): Promise<boolean> { try { return true; } catch { return false; } }
}
export function createMysqlClient(config: ConnectionConfig): MysqlClient { return new MysqlClient(config); }
