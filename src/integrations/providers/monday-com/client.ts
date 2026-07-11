export function getMondayHeaders(apiToken: string): Record<string, string> {
  return { Authorization: apiToken, "Content-Type": "application/json", "API-Version": "2024-01" };
}

export class MondayComClient {
  private apiToken: string;
  constructor(apiToken: string) { this.apiToken = apiToken; }
  private get headers() { return { Authorization: this.apiToken, "Content-Type": "application/json", "API-Version": "2024-01" }; }

  async query(graphql: string): Promise<any> { const r = await fetch("https://api.monday.com/v2", { method: "POST", headers: this.headers, body: JSON.stringify({ query: graphql }) }); return r.json(); }

  async listBoards(): Promise<any[]> { const q = `query { boards(limit: 100) { id name board_kind description groups { id title } } }`; const r = await this.query(q); return r?.data?.boards || []; }
  async getBoard(id: number): Promise<any> { const q = `query { boards(ids: [${id}]) { id name columns { id title type } groups { id title } } }`; const r = await this.query(q); return r?.data?.boards?.[0]; }
  async createItem(boardId: number, groupId: string, itemName: string, columnValues?: any): Promise<any> { const cv = columnValues ? JSON.stringify(columnValues).replace(/"/g, '\\"') : "{}"; const q = `mutation { create_item(board_id: ${boardId}, group_id: "${groupId}", item_name: "${itemName}", column_values: "${cv}") { id name } }`; const r = await this.query(q); return r?.data?.create_item; }
  async listItems(boardId: number, limit = 50): Promise<any[]> { const q = `query { boards(ids: [${boardId}]) { items_page(limit: ${limit}) { items { id name column_values { id text value } } } } }`; const r = await this.query(q); return r?.data?.boards?.[0]?.items_page?.items || []; }
  async healthCheck(): Promise<boolean> { try { const r = await this.query("query { boards(limit: 1) { id } }"); return !!r?.data?.boards; } catch { return false; } }
}

export function createMondayComClient(config: any): MondayComClient { return new MondayComClient(config.apiToken || ""); }