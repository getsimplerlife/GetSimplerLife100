import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class MondayClient {
  private client: HttpClient; private apiToken: string;
  constructor(apiToken: string) {
    this.client = new HttpClient({ baseUrl: "https://api.monday.com/v2", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 2, baseDelay: 1000, maxDelay: 5000 }, timeout: 30000 });
    this.apiToken = apiToken;
  }
  private get headers() { return { Authorization: this.apiToken, "Content-Type": "application/json", "API-Version": "2024-01" }; }

  async query(query: string): Promise<any> {
    const res = await this.client.post<{ data: any }>("/", { query }, this.headers);
    return res.data;
  }

  async getBoards(): Promise<any[]> {
    const q = `query { boards (limit: 50) { id name board_kind description groups { id title } } }`;
    const res = await this.query(q);
    return res?.data?.boards || [];
  }

  async createItem(boardId: number, groupId: string, itemName: string, columnValues?: Record<string, any>): Promise<any> {
    const colValues = columnValues ? `"${JSON.stringify(columnValues).replace(/"/g, '\\"')}"` : "{}";
    const q = `mutation { create_item (board_id: ${boardId}, group_id: "${groupId}", item_name: "${itemName}", column_values: ${colValues}) { id name } }`;
    const res = await this.query(q);
    return res?.data?.create_item;
  }

  async getItems(boardId: number, limit = 50): Promise<any[]> {
    const q = `query { boards (ids: [${boardId}]) { items_page (limit: ${limit}) { items { id name column_values { id text value } } } } }`;
    const res = await this.query(q);
    return res?.data?.boards?.[0]?.items_page?.items || [];
  }

  async healthCheck(): Promise<boolean> {
    try { const res = await this.query("query { boards (limit: 1) { id } }"); return !!res?.data?.boards; } catch { return false; }
  }
}

export function createMondayClient(config: ConnectionConfig): MondayClient {
  return new MondayClient(config.apiToken || "");
}