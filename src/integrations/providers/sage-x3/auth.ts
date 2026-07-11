import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export async function loginSageX3(config: { baseUrl: string; username: string; password: string; language?: string }): Promise<string> {
  const r = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/api/auth/v1/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: config.username, password: config.password, language: config.language || "ENG" }) });
  if (!r.ok) throw new Error(`Sage X3 login failed: ${r.status}`);
  const d = await r.json();
  return d.token || d.sessionId || "";
}