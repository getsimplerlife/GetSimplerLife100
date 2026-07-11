import { HttpClient } from "../../framework/client"; import { ConnectionConfig } from "../../framework/connection";

export async function loginKinetic(config: { baseUrl: string; username: string; password: string; companyId: string }): Promise<string> {
  const r = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/api/v1/auth/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: config.username, password: config.password, grant_type: "password", company_id: config.companyId }) });
  if (!r.ok) throw new Error(`Kinetic login failed: ${r.status}`);
  const d = await r.json();
  return d.access_token || "";
}