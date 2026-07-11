import { ConnectionConfig } from "../../framework/connection";

export class OdooClient {
  private baseUrl: string; private db: string; private uid: number; private password: string;
  constructor(baseUrl: string, db: string, uid: number, password: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, ""); this.db = db; this.uid = uid; this.password = password;
  }

  async rpc(endpoint: string, method: string, args: any[]): Promise<any> {
    const r = await fetch(`${this.baseUrl}/jsonrpc`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service: "object", method: "execute", args: [this.db, this.uid, this.password, endpoint, method, ...args] } }) });
    const d = await r.json();
    if (d.error) throw new Error(`Odoo error: ${JSON.stringify(d.error)}`);
    return d.result;
  }

  async search(model: string, domain: any[], fields?: string[]): Promise<any[]> {
    const ids = await this.rpc(model, "search", [domain]);
    if (!ids || ids.length === 0) return [];
    return this.rpc(model, "read", [ids, fields || []]);
  }
  async create(model: string, data: any): Promise<number> { return this.rpc(model, "create", [data]); }
  async read(model: string, id: number, fields?: string[]): Promise<any> { return this.rpc(model, "read", [[id], fields || []]); }
  async update(model: string, id: number, data: any): Promise<void> { await this.rpc(model, "write", [[id], data]); }
  async unlink(model: string, id: number): Promise<void> { await this.rpc(model, "unlink", [[id]]); }
  async callMethod(model: string, method: string, args: any[]): Promise<any> { return this.rpc(model, method, args); }

  async healthCheck(): Promise<boolean> {
    try { const r = await this.rpc("res.partner", "search", [[["id", "!=", 0]], 1]); return Array.isArray(r); } catch { return false; }
  }
}

export function createOdooClient(config: ConnectionConfig): OdooClient {
  return new OdooClient(config.baseUrl || "", config.database || "", config.uid || 0, config.password || "");
}