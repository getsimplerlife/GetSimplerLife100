export async function loginOdoo(config: { baseUrl: string; database: string; username: string; password: string }): Promise<{ uid: number; sessionId: string }> {
  const r = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/web/session/authenticate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", params: { db: config.database, login: config.username, password: config.password } }) });
  if (!r.ok) throw new Error(`Odoo login failed: ${r.status}`);
  const d = await r.json();
  const cookies = r.headers.get("set-cookie") || "";
  return { uid: d.result?.uid || 0, sessionId: cookies.split(";")[0] || "" };
}