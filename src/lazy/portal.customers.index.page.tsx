import { Link } from "@tanstack/react-router";
import { useState, useMemo, useCallback, useEffect } from "react";
import { integrations } from "../content/integrations";
import { getAuthMethod } from "../content/integration-auth-map";

// Data loaded client-side via fetch() — server functions removed because
// they crash SSR with "globalThis.app.config" (vinxi/http context unavailable).
// Wired to the real portal API: GET /api/portal/connections (list, read-only).
// a2: persistent connect/disconnect are retired — external tools are
// import/migration lanes only (Import page), and nothing is stored here.



// ── Types ──────────────────────────────────────────────────────────
interface ConnConnection {
  id: string; provider: string; displayName: string;
  status: "active" | "expired" | "error" | "pending";
  assignedAgent: string | null; healthAt: string | null; errorMsg: string | null;
}

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
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/portal/connections", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load connections (${res.status})`);
      const payload = await res.json();
      const list: any[] = payload?.data?.connections ?? [];
      // Map the real credential-store shape (provider-scoped rows from
      // tenant_oauth_credentials.json) onto this page's ConnConnection.
      const mapped: ConnConnection[] = list.map((c) => ({
        id: c.provider,
        provider: c.provider,
        displayName: c.provider,
        status: c.status === "ok" ? "active" : c.status === "error" ? "error" : c.connected ? "active" : "pending",
        assignedAgent: null,
        healthAt: c.lastProbeAt ?? null,
        errorMsg: c.lastError ?? null,
      }));
      setConnections(mapped); setLoaded(true);
    } catch (e: any) {
      console.error("Failed to load CRM/ERP connections:", e);
      setLoaded(true);
    }
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
  const errConns = connections.filter((c) => c.status === "error" || c.status === "expired");


  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">

      {/* Header */}
      <div className="px-6 pt-8 pb-4 border-b border-stone-900">
        <h2 className="text-xl font-extrabold text-white">CRM &amp; ERP import</h2>
        <p className="text-xs text-stone-500 mt-1">Connect your CRM and ERP systems to bring your data in. Transfers are one-time and client-initiated — nothing syncs automatically and nothing writes back.</p>
      </div>

      {/* Stats Dashboard */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-stone-900/50 border border-stone-800 rounded-xl p-4">
          <div className="text-2xl font-black text-white">{crmErpProviders.length}</div>
          <div className="text-[10px] font-mono text-stone-500 uppercase">CRM/ERP Providers</div>
        </div>
        <div className="bg-stone-900/50 border border-emerald-500/20 rounded-xl p-4">
          <div className="text-2xl font-black text-emerald-400">{activeConns.length}</div>
          <div className="text-[10px] font-mono text-stone-500 uppercase">With access</div>
        </div>
        {errConns.length > 0 && (
          <div className="bg-stone-900/50 border border-amber-500/20 rounded-xl p-4">
            <div className="text-2xl font-black text-amber-400">{errConns.length}</div>
            <div className="text-[10px] font-mono text-stone-500 uppercase">Need Attention</div>
          </div>
        )}
      </div>


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
                <span className={`shrink-0 text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                  authMethod === "oauth2" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                }`}>{authMethod === "oauth2" ? "OAuth" : "API Key"}</span>
              </div>

              {/* Status row */}
              {isConnected && (
                <div className="mt-3 flex items-center gap-2">
                  <span className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[conn!.status] || "bg-stone-600"}`} />
                  <span className="text-[10px] font-mono font-bold text-stone-400 uppercase">{conn!.status}</span>

                </div>
              )}

              <p className="text-xs text-stone-500 mt-2 line-clamp-2">{provider.description}</p>

              {/* Actions */}
              <div className="mt-4 pt-3 border-t border-stone-850/60 flex items-center justify-between gap-2">
                {isConnected ? (
                  <span className="text-[10px] font-mono font-bold text-emerald-400">✓ Access set up</span>
                ) : (
                  <Link to="/portal/import" className="w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-[10px] font-bold py-1.5 rounded-lg">
                    Import from {provider.name} →
                  </Link>
                )}
              </div>


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
            <div className="text-3xl">📥</div>
            <h3 className="text-sm font-black text-white">No imports yet</h3>
            <p className="text-xs text-stone-500">Import your first CRM or ERP system above — records come in as a one-time import, nothing flows automatically, and nothing writes back.</p>
            <Link to="/integrations" className="inline-block text-[10px] font-mono font-bold text-indigo-400 hover:text-indigo-300 border border-indigo-500/20 rounded-lg px-4 py-2">
              Browse Full Catalog →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default CRMERPConnectorPage;
