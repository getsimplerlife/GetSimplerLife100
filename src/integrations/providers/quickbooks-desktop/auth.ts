import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export async function loginQBWC(config: { webConnectorUrl: string; username: string; password: string }): Promise<string> {
  const r = await fetch(`${config.webConnectorUrl.replace(/\/+$/, "")}/v1/qbwc`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ user: config.username, password: config.password }).toString() });
  if (!r.ok) throw new Error(`QBWC login failed: ${r.status}`);
  const ticket = r.headers.get("x-ticket") || "";
  return ticket;
}

export async function sendQBXML(webConnectorUrl: string, ticket: string, qbxml: string): Promise<string> {
  const body = `<?xml version="1.0" encoding="utf-8"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError">${qbxml}</QBXMLMsgsRq></QBXML>`;
  const r = await fetch(`${webConnectorUrl.replace(/\/+$/, "")}/v1/qbwc`, { method: "POST", headers: { "Content-Type": "application/x-qbxml", "X-Ticket": ticket }, body });
  return r.text();
}