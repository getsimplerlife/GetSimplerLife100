import { ConnectionConfig } from "../../framework/connection";

export class QBDClient {
  private webConnectorUrl: string; private ticket: string;
  constructor(webConnectorUrl: string, ticket: string) {
    this.webConnectorUrl = webConnectorUrl; this.ticket = ticket;
  }

  async sendRequest(qbxml: string): Promise<string> {
    const body = `<?xml version="1.0" encoding="utf-8"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError">${qbxml}</QBXMLMsgsRq></QBXML>`;
    const r = await fetch(`${this.webConnectorUrl.replace(/\/+$/, "")}/v1/qbwc`, { method: "POST", headers: { "Content-Type": "application/x-qbxml" }, body });
    return r.text();
  }

  async queryCustomers(nameFilter?: string): Promise<string> {
    const q = nameFilter ? `<CustomerQueryRq><NameFilter><MatchCriterion>Contains</MatchCriterion><Name>${nameFilter}</Name></NameFilter></CustomerQueryRq>` : "<CustomerQueryRq />";
    return this.sendRequest(q);
  }
  async addCustomer(name: string, email?: string): Promise<string> {
    return this.sendRequest(`<CustomerAddRq><CustomerAdd><Name>${name}</Name>${email ? `<Email>${email}</Email>` : ""}</CustomerAdd></CustomerAddRq>`);
  }
  async queryInvoices(customerRef?: string): Promise<string> {
    const q = customerRef ? `<InvoiceQueryRq><RefNumber>${customerRef}</RefNumber></InvoiceQueryRq>` : "<InvoiceQueryRq />";
    return this.sendRequest(q);
  }
  async addInvoice(customerRef: string, date: string, items: any[]): Promise<string> {
    const itemLines = items.map(i => `<InvoiceLineAdd><ItemRef><FullName>${i.itemName}</FullName></ItemRef><Amount>${i.amount}</Amount></InvoiceLineAdd>`).join("");
    return this.sendRequest(`<InvoiceAddRq><InvoiceAdd><CustomerRef><FullName>${customerRef}</FullName></CustomerRef><TxnDate>${date}</TxnDate>${itemLines}</InvoiceAdd></InvoiceAddRq>`);
  }

  async healthCheck(): Promise<boolean> {
    try { const r = await this.sendRequest("<HostQueryRq />"); return r.includes("HostQueryRs"); } catch { return false; }
  }
}

export function createQBDClient(config: ConnectionConfig): QBDClient {
  return new QBDClient(config.webConnectorUrl || "", config.ticket || "");
}