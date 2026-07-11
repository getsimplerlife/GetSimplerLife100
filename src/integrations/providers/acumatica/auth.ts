import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export interface AcumaticaAuth { siteUrl: string; username: string; password: string; tenant?: string; branch?: string; }

export async function loginAcumatica(config: AcumaticaAuth): Promise<string> {
  const loginData: any = { name: config.username, password: config.password };
  if (config.tenant) loginData.tenant = config.tenant;
  if (config.branch) loginData.branch = config.branch;
  const r = await fetch(`${config.siteUrl.replace(/\/+$/, "")}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loginData) });
  if (!r.ok) throw new Error(`Acumatica login failed: ${r.status}`);
  return r.headers.get("Set-Cookie") || "";
}

export async function logoutAcumatica(siteUrl: string, cookie: string): Promise<void> {
  await fetch(`${siteUrl.replace(/\/+$/, "")}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
}