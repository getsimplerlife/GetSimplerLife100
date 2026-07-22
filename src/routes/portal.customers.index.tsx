import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState, useMemo, useCallback, useEffect } from "react";
import { integrations } from "../content/integrations";
import { getAuthMethod, AGENT_TYPES } from "../content/integration-auth-map";
import { db } from "../db/index";
import { integrations as integrationsTable } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { getUser } from "../db/queries";

export const Route = createFileRoute("/portal/customers/")({
  component: CRMERPConnectorPage,
});

// ── Types ──────────────────────────────────────────────────────────
interface ConnectionRow {
  id: string; provider: string; displayName: string;
  status: string; config: string; healthAt: string | null; errorMsg: string | null;
  createdAt: string; updatedAt: string;
}

interface ConnConnection {
  id: string; provider: string; displayName: string;
  status: "active" | "expired" | "error" | "pending";
  assignedAgent: string | null; healthAt: string | null; errorMsg: string | null;
}

// ── Server Functions ───────────────────────────────────────────────
const getCRMERPData = createServerFn({ method: "GET" }).handler(async () => {
  const user = await getUser();
  if (!user) return { connections: [] as ConnConnection[] };

  const rows = await db.query.integrations.findMany({
    where: eq(integrationsTable.userId, user.id),
    orderBy: (integrationsTable, { desc }) => [desc(integrationsTable.updatedAt)],
  });

  const connections: ConnConnection[] = rows.map((r) => {
    let cfg: Record<string, any> = {};
    try { cfg = JSON.parse(r.config); } catch { /* */ }
    return {
      id: r.id, provider: r.provider, displayName: r.displayName,
      status: r.status as ConnConnection["status"],
      assignedAgent: cfg.assigned_agent ?? null,
      healthAt: r.healthAt?.toISOString?.() ?? null,
      errorMsg: r.errorMsg ?? null,
    };
  });

  return { connections };
});

const connectCRMERP = createServerFn()
  .validator((d: { provider: string; displayName: string; apiKey: string; subdomain?: string }) => d)
  .handler(async ({ data }) => {
    const user = await getUser(); if (!user) throw new Error("Unauthorized");
    const id = crypto.randomUUID(); const now = new Date();
    await db.insert(integrationsTable).values({
      id, userId: user.id, provider: data.provider, displayName: data.displayName,
      config: JSON.stringify({ apiKey: data.apiKey, subdomain: data.subdomain }),
      status: "active", createdAt: now, updatedAt: now,
    });
    return { success: true, connectionId: id };
  });

const disconnectCRMERP = createServerFn()
  .validator((connectionId: string) => connectionId)
  .handler(async ({ data: cid }) => {
    const user = await getUser(); if (!user) throw new Error("Unauthorized");
    await db.delete(integrationsTable).where(and(eq(integrationsTable.id, cid), eq(integrationsTable.userId, user.id)));
    return { success: true };
  });

const setAgentRouting = createServerFn()
  .validator((d: { connectionId: string; agentType: string | null }) => d)
  .handler(async ({ data }) => {
    const user = await getUser(); if (!user) throw new Error("Unauthorized");
    const row = await db.query.integrations.findFirst({
      where: and(eq(integrationsTable.id, data.connectionId), eq(integrationsTable.userId, user.id)),
    });
    if (!row) throw new Error("Connection not found");
    let cfg: Record<string, any> = {};
    try { cfg = JSON.parse(row.config); } catch { /* */ }
    if (data.agentType === null) delete cfg.assigned_agent;
    else cfg.assigned_agent = data.agentType;
    await db.update(integrationsTable).set({ config: JSON.stringify(cfg), updatedAt: new Date() })
      .where(and(eq(integrationsTable.id, data.connectionId), eq(integrationsTable.userId, user.id)));
    return { success: true };
  });

const testConnection = createServerFn()
  .validator((connectionId: string) => connectionId)
  .handler(async ({ data: cid }) => {
    const user = await getUser(); if (!user) throw new Error("Unauthorized");
    const row = await db.query.integrations.findFirst({
      where: and(eq(integrationsTable.id, cid), eq(integrationsTable.userId, user.id)),
    });
    if (!row) throw new Error("Connection not found");
    let cfg: Record<string, any> = {};
    try { cfg = JSON.parse(row.config); } catch { /* */ }
    const hasCreds = !!(cfg.apiKey || cfg.accessToken);
    const now = new Date();
    if (hasCreds) {
      await db.update(integrationsTable).set({ status: "active", healthAt: now, errorMsg: null, updatedAt: now })
        .where(and(eq(integrationsTable.id, cid), eq(integrationsTable.userId, user.id)));
      return { success: true, status: "active", healthAt: now.toISOString() };
    }
    await db.update(integrationsTable).set({ status: "error", healthAt: now, errorMsg: "No valid credentials", updatedAt: now })
      .where(and(eq(integrationsTable.id, cid), eq(integrationsTable.userId, user.id)));
    return { success: false, status: "error", healthAt: now.toISOString(), error: "No valid credentials" };
  });

// ── Constants ──────────────────────────────────────────────────────
const CRM_ERP_CATEGORIES = ["CRM", "ERP"];
const crmErpProviders = integrations.filter((i) => CRM_ERP_CATEGORIES.includes(i.category));

const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-500", expired: "bg-amber-500", error: "bg-rose-500", pending: "bg-indigo-500 animate-pulse",
};

// ── Component ──────────────────────────────────────────────────────
function CRMERPConnectorPage() {
  const [connections, setConnections] = useState<ConnConnection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<"ALL" | "CRM" | "ERP">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [connectTarget, setConnectTarget] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  const [routingId, setRoutingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
  };

  const refresh = useCallback(async () => {
    const { connections: c } = await getCRMERPData();
    setConnections(c); setLoaded(true);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const connMap = useMemo(() => {
    const m: Record<string, ConnConnection> = {};
    connections.forEach((c) => { m[c.provider] = c; });
    return m;
  }, [connections]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = crmErpProviders;
    if (activeCat !== "ALL") list = list.filter((i) => i.category.toUpperCase() === activeCat);
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q) || i.id.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [search, activeCat]);

  const activeConns = connections.filter((c) => c.status === "active");
  const routedConns = connections.filter((c) => c.assignedAgent);
  const errConns = connections.filter((c) => c.status === "error" || c.status === "expired");

  const handleConnect = async () => {
    if (!connectTarget || !apiKey.trim()) { setConnectError("API Key required"); return; }
    setConnecting(true); setConnectError("");
    try {
      const provider = crmErpProviders.find((p) => p.id === connectTarget);
      await connectCRMERP({ data: { provider: connectTarget, displayName: provider?.name ?? connectTarget, apiKey: apiKey.trim(), subdomain: subdomain.trim() || undefined } });
      showToast(`Connected to ${provider?.name ?? connectTarget}`);
      setConnectTarget(null); setApiKey(""); setSubdomain("");
      await refresh();
    } catch (e: any) { setConnectError(e.message || "Connection failed"); }
    finally { setConnecting(false); }
  };

  const handleDisconnect = async (cid: string, name: string) => {
    if (!confirm(`Disconnect ${name}?`)) return;
    await disconnectCRMERP({ data: cid });
    showToast(`Disconnected ${name}`);
    await refresh();
  };

  const handleRoute = async (cid: string, agent: string | null) => {
    setRoutingId(cid);
    await setAgentRouting({ data: { connectionId: cid, agentType: agent } });
    await refresh(); setRoutingId(null);
  };

  const handleTest = async (cid: string) => {
    setTestingId(cid);
    await testConnection({ data: cid });
    await refresh(); setTestingId(null);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl text-xs font-mono font-bold shadow-lg ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
        }`}>{toast.msg}</div>
      )}

      {/* Header */}
      <div className="px-6 pt-8 pb-4 border-b border-stone-900">
        <h2 className="text-xl font-extrabold text-white">CRM & ERP Universal Connector</h2>
        <p className="text-xs text-stone-500 mt-1">Connect your CRM and ERP systems. Data routes automatically to your AI Operations Team.</p>
      </div>

      {/* Stats Dashboard */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-4">
          <div className="text-2xl font-black text-white">{crmErpProviders.length}</div>
          <div className="text-[10px] font-mono text-stone-500 uppercase">CRM/ERP Providers</div>
        </div>
        <div className="bg-stone-900/50 border border-emerald-500/20 rounded-xl p-4">
          <div className="text-2xl font-black text-emerald-400">{activeConns.length}</div>
          <div className="text-[10px] font-mono text-stone-500 uppercase">Connected</div>
        </div>
        <div className="bg-stone-900/50 border border-indigo-500/20 rounded-xl p-4">
          <div className="text-2xl font-black text-indigo-400">{routedConns.length}</div>
          <div className="text-[10px] font-mono text-stone-500 uppercase">AI-Routed</div>
        </div>
        {errConns.length > 0 && (
          <div className="bg-stone-900/50 border border-amber-500/20 rounded-xl p-4">
            <div className="text-2xl font-black text-amber-400">{errConns.length}</div>
            <div className="text-[10px] font-mono text-stone-500 uppercase">Need Attention</div>
          </div>
        )}
      </div>

      {/* AI Routing Overview */}
      {routedConns.length > 0 && (
        <div className="px-6 pb-4">
          <div className="bg-stone-900/30 border border-stone-800 rounded-xl p-4">
            <h4 className="text-xs font-mono font-bold text-stone-400 uppercase mb-3">AI Processing Pipeline</h4>
            <div className="flex flex-wrap gap-2">
              {routedConns.map((c) => {
                const agent = AGENT_TYPES.find((a) => a.id === c.assignedAgent);
                const provider = crmErpProviders.find((p) => p.id === c.provider);
                return (
                  <div key={c.id} className="flex items-center gap-1.5 bg-stone-950 border border-stone-800 rounded-lg px-3 py-1.5">
                    <span className="text-[10px] font-bold text-stone-300">{provider?.name ?? c.provider}</span>
                    <span className="text-stone-600">→</span>
                    <span className="text-[10px] font-mono font-bold text-indigo-400">{agent?.name ?? c.assignedAgent}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="px-6 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between border-b border-stone-900">
        <div className="flex gap-1">
          {["ALL", "CRM", "ERP"].map((cat) => (
            <button key={cat} onClick={() => setActiveCat(cat as any)}
              className={`text-[10px] font-mono font-bold px-3 py-1.5 rounded-lg transition-all ${
                activeCat === cat ? "bg-indigo-600 text-white" : "bg-stone-900 text-stone-400 hover:text-stone-200"
              }`}>{cat}</button>
          ))}
        </div>
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search providers…"
          className="w-full sm:w-56 bg-stone-900 border border-stone-800 focus:border-indigo-600 rounded-lg px-3 py-1.5 text-xs text-stone-200 outline-none placeholder:text-stone-600" />
      </div>

      {/* Provider Grid */}
      <div className="px-6 py-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((provider) => {
          const conn = connMap[provider.id];
          const isConnected = !!conn;
          const authMethod = getAuthMethod(provider.id);
          const isExpanded = expandedId === provider.id;
          const isConnecting = connectTarget === provider.id;

          return (
            <div key={provider.id}
              className={`bg-stone-900/30 border rounded-2xl p-5 transition-all ${
                isConnected ? (conn!.status === "active" ? "border-emerald-500/20" : "border-amber-500/20") : "border-stone-850 hover:border-stone-700"
              }`}>
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h4 className="font-extrabold text-sm text-white truncate">{provider.name}</h4>
                  <span className="text-[10px] font-mono text-stone-500 uppercase">{provider.category}</span>
                </div>
                <span className={`shrink-0 text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                  authMethod === "oauth2" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>{authMethod === "oauth2" ? "OAuth" : "API Key"}</span>
              </div>

              {/* Status row */}
              {isConnected && (
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[conn!.status] || "bg-stone-600"}`} />
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase">{conn!.status}</span>
                  {conn!.assignedAgent && (
                    <span className="text-[9px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded">
                      → {AGENT_TYPES.find((a) => a.id === conn!.assignedAgent)?.name ?? conn!.assignedAgent}
                    </span>
                  )}
                </div>
              )}

              <p className="text-xs text-stone-500 mt-2 line-clamp-2">{provider.description}</p>

              {/* Actions */}
              <div className="mt-4 pt-3 border-t border-stone-850/60 flex items-center justify-between gap-2">
                {isConnected ? (
                  <>
                    <button onClick={() => setExpandedId(isExpanded ? null : provider.id)}
                      className="text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300">
                      {isExpanded ? "▼ Configure" : "▶ Configure"}
                    </button>
                    <button onClick={() => handleDisconnect(conn!.id, provider.name)}
                      className="text-[10px] font-mono font-bold text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-lg px-3 py-1.5">
                      Disconnect
                    </button>
                  </>
                ) : isConnecting ? (
                  <div className="w-full space-y-2">
                    <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                      placeholder="API Key" className="w-full bg-stone-950 border border-stone-800 focus:border-indigo-600 rounded-lg px-3 py-1.5 text-xs text-stone-200 outline-none" />
                    <input type="text" value={subdomain} onChange={(e) => setSubdomain(e.target.value)}
                      placeholder="Subdomain / Instance URL" className="w-full bg-stone-950 border border-stone-800 focus:border-indigo-600 rounded-lg px-3 py-1.5 text-xs text-stone-200 outline-none" />
                    {connectError && <p className="text-[9px] text-rose-400 font-mono">{connectError}</p>}
                    <div className="flex gap-2">
                      <button onClick={handleConnect} disabled={connecting}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold py-1.5 rounded-lg disabled:opacity-50">
                        {connecting ? "Connecting…" : "Connect"}
                      </button>
                      <button onClick={() => { setConnectTarget(null); setConnectError(""); setApiKey(""); setSubdomain(""); }}
                        className="px-3 text-[10px] font-mono text-stone-500 hover:text-stone-300 border border-stone-800 rounded-lg">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setConnectTarget(provider.id)}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold py-1.5 rounded-lg">
                    Connect
                  </button>
                )}
              </div>

              {/* Expanded config */}
              {isExpanded && isConnected && (
                <div className="mt-4 pt-3 border-t border-stone-850/60 space-y-3">
                  {/* Health */}
                  <div className="flex items-center justify-between bg-stone-950/50 rounded-lg p-2.5 border border-stone-850/50">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[conn!.status]}`} />
                      <span className="text-[10px] font-mono font-bold text-stone-300 uppercase">{conn!.status}</span>
                      {conn!.healthAt && <span className="text-[9px] font-mono text-stone-500">Last: {new Date(conn!.healthAt).toLocaleString()}</span>}
                    </div>
                    <button onClick={() => handleTest(conn!.id)} disabled={testingId === conn!.id}
                      className="text-[9px] font-mono font-bold text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded px-2 py-1 disabled:opacity-50">
                      {testingId === conn!.id ? "Testing…" : "Test"}
                    </button>
                  </div>
                  {conn!.errorMsg && (
                    <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-2.5">
                      <p className="text-[9px] font-mono text-rose-400">{conn!.errorMsg}</p>
                    </div>
                  )}
                  {/* AI Routing */}
                  <div>
                    <p className="text-[10px] font-mono font-bold text-stone-400 uppercase mb-1.5">Route Data to AI Agent</p>
                    <select value={conn!.assignedAgent || ""}
                      onChange={(e) => handleRoute(conn!.id, e.target.value || null)}
                      disabled={routingId === conn!.id}
                      className="w-full bg-stone-950 border border-stone-800 focus:border-indigo-600 rounded-lg px-3 py-1.5 text-xs text-stone-200 outline-none disabled:opacity-50">
                      <option value="">— Select AI Agent —</option>
                      <option value="">(Unassigned)</option>
                      {AGENT_TYPES.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-stone-500 text-xs">No providers match your filters.</div>
      )}

      {/* Empty CTA */}
      {loaded && connections.length === 0 && (
        <div className="px-6 pb-12 text-center">
          <div className="bg-stone-900/20 border border-stone-800 border-dashed rounded-3xl p-10 max-w-lg mx-auto space-y-4">
            <div className="text-3xl">🔌</div>
            <h3 className="text-sm font-black text-white">No CRM/ERP Connections Yet</h3>
            <p className="text-xs text-stone-500">Connect your first CRM or ERP system above. Once connected, data flows automatically to your assigned AI agents.</p>
            <Link to="/integrations" className="inline-block text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded-lg px-4 py-2">
              Browse Full Catalog →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
