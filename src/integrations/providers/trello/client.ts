import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export class TrelloClient {
  private client: HttpClient; private apiKey: string; private token: string;
  constructor(apiKey: string, token: string) {
    this.client = new HttpClient({ baseUrl: "https://api.trello.com/1", rateLimit: { maxRequestsPerSecond: 10 }, retry: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 }, timeout: 30000 });
    this.apiKey = apiKey; this.token = token;
  }
  private get auth() { return `key=${this.apiKey}&token=${this.token}`; }

  async listBoards(): Promise<any[]> { const r = await this.client.get(`/members/me/boards?${this.auth}`, {}); return r.data || []; }
  async getBoard(id: string): Promise<any> { const r = await this.client.get(`/boards/${id}?${this.auth}`, {}); return r.data; }
  async listLists(boardId: string): Promise<any[]> { const r = await this.client.get(`/boards/${boardId}/lists?${this.auth}`, {}); return r.data || []; }
  async listCards(listId: string): Promise<any[]> { const r = await this.client.get(`/lists/${listId}/cards?${this.auth}`, {}); return r.data || []; }
  async createCard(listId: string, name: string, desc?: string): Promise<any> { const r = await this.client.post(`/cards?${this.auth}&idList=${listId}&name=${encodeURIComponent(name)}${desc ? `&desc=${encodeURIComponent(desc)}` : ""}`, undefined, { "Content-Type": "application/json" }); return r.data; }
  async updateCard(cardId: string, data: any): Promise<any> { const r = await this.client.put(`/cards/${cardId}?${this.auth}`, data, { "Content-Type": "application/json" }); return r.data; }
  async addComment(cardId: string, text: string): Promise<any> { const r = await this.client.post(`/cards/${cardId}/actions/comments?${this.auth}&text=${encodeURIComponent(text)}`, undefined, { "Content-Type": "application/json" }); return r.data; }
  async healthCheck(): Promise<boolean> { try { const r = await this.client.get(`/members/me?${this.auth}`, {}); return r.ok; } catch { return false; } }
}

export function createTrelloClient(config: ConnectionConfig): TrelloClient {
  return new TrelloClient(config.apiKey || "", config.token || "");
}