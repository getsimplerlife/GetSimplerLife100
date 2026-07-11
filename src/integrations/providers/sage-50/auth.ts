export async function loginSage50(config: { baseUrl: string; username: string; password: string; company: string }): Promise<string> {
  const r = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: config.username, password: config.password, company: config.company }) });
  if (!r.ok) throw new Error(`Sage 50 login failed: ${r.status}`);
  const d = await r.json();
  return d.token || "";
}