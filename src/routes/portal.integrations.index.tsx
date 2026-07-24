import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";

export const Route = createFileRoute("/portal/integrations/")({
  component: IntegrationsPage,
});

const PAGE_SIZE = 20;

interface Provider {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
}

function IntegrationsPage() {
  const [allProviders, setAllProviders] = useState<Provider[]>([]);
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(0);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [showCreds, setShowCreds] = useState<Provider | null>(null);
  const [creds, setCreds] = useState({ apiKey: "", apiSecret: "", clientId: "", clientSecret: "", accessToken: "", username: "", password: "" });

  useEffect(() => {
    (async () => {
      try {
        const [provRes, connRes] = await Promise.all([
          fetch("/api/integrations/providers?limit=200", { credentials: "include" }),
          fetch("/api/integrations", { credentials: "include" }),
        ]);
        if (provRes.ok) {
          const json = await provRes.json();
          setAllProviders(json.data || []);
        }
        if (connRes.ok) {
          const json = await connRes.json();
          setConnectedIds(new Set((json.data || []).map((c: any) => c.providerId || c.provider)));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = allProviders;
    if (search) list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (category !== "All") list = list.filter(p => p.category === category);
    return list;
  }, [allProviders, search, category]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const categories = useMemo(() => [...new Set(allProviders.map(p => p.category))].sort(), [allProviders]);

  const handleConnect = useCallback(async (provider: Provider) => {
      if (!showCreds) {
        setShowCreds(provider);
        setCreds({ apiKey: "", apiSecret: "", clientId: "", clientSecret: "", accessToken: "", username: "", password: "" });
        return;
      }
      setConnecting(provider.id);
      try {
        // Build credentials object — only include non-empty fields
        const credentials: Record<string, string> = {};
        if (creds.apiKey.trim()) credentials.apiKey = creds.apiKey.trim();
        if (creds.apiSecret.trim()) credentials.apiSecret = creds.apiSecret.trim();
        if (creds.clientId.trim()) credentials.clientId = creds.clientId.trim();
        if (creds.clientSecret.trim()) credentials.clientSecret = creds.clientSecret.trim();
        if (creds.accessToken.trim()) credentials.accessToken = creds.accessToken.trim();
        if (creds.username.trim()) credentials.username = creds.username.trim();
        if (creds.password.trim()) credentials.password = creds.password.trim();
        const res = await fetch("/api/integrations/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ providerId: provider.id, providerName: provider.name, credentials }),
        });
        if (res.ok) {
          setConnectedIds(prev => new Set([...prev, provider.id]));
          setShowCreds(null);
          setFeedback(`✓ Connected to ${provider.name}`);
        } else {
          const err = await res.json().catch(() => ({ error: "Connection failed" }));
          setFeedback(err.error || "Connection failed");
        }
      } catch { setFeedback("Connection failed"); }
      setConnecting(null);
      setTimeout(() => setFeedback(""), 4000);
    }, [showCreds, creds]);

  const handleDisconnect = useCallback(async (provider: Provider) => {
    try {
      await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ providerId: provider.id }),
      });
      setConnectedIds(prev => { const n = new Set(prev); n.delete(provider.id); return n; });
      setFeedback(`Disconnected ${provider.name}`);
      setTimeout(() => setFeedback(""), 3000);
    } catch { setFeedback("Failed to disconnect"); }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Integrations</h1>
          <p className="text-stone-400 mt-1">
            {allProviders.length}+ providers available · {connectedIds.size} connected
          </p>
        </div>
        <Link to="/portal/connections" className="text-xs font-bold text-blue-400 hover:text-blue-300 transition-colors">
          Manage Connected Accounts →
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search 180+ providers..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
        />
        <div className="flex gap-1.5 flex-wrap max-h-20 overflow-y-auto">
          {(["All", ...categories]).map(c => (
            <button
              key={c}
              onClick={() => { setCategory(c); setPage(0); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                category === c
                  ? "bg-emerald-600 text-white"
                  : "bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Results info */}
      <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
        <span>{filtered.length} providers found</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 transition-all">←</button>
            <span className="font-bold text-stone-400">{page + 1}/{totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-2 py-1 rounded bg-stone-900 hover:bg-stone-800 disabled:opacity-30 transition-all">→</button>
          </div>
        )}
      </div>

      {/* Provider Grid */}
      {pageItems.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔍</div>
          <p className="font-bold">No providers found</p>
          <p className="text-sm mt-1">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {pageItems.map(p => {
            const connected = connectedIds.has(p.id);
            return (
              <div key={p.id}
                className={`bg-stone-900 border rounded-xl p-4 hover:border-stone-700 transition-all group ${
                  connected ? "border-emerald-900/50" : "border-stone-800"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xl shrink-0">{typeof p.icon === "string" && p.icon.length <= 3 ? p.icon : "🔌"}</span>
                    <div className="min-w-0">
                      <div className="font-bold text-white text-xs truncate">{p.name}</div>
                      <span className="text-[9px] font-mono text-stone-500 uppercase tracking-wider">{p.category}</span>
                    </div>
                  </div>
                  {connected && <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Connected" />}
                </div>
                <p className="text-[10px] text-stone-500 leading-relaxed line-clamp-2 mb-3">{p.description}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => connected ? handleDisconnect(p) : handleConnect(p)}
                    disabled={connecting === p.id}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-all ${
                      connected
                        ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                        : showCreds?.id === p.id
                        ? "bg-emerald-600 text-white"
                        : "bg-stone-800 text-stone-300 hover:bg-emerald-600 hover:text-white"
                    } disabled:opacity-50`}
                  >
                    {connecting === p.id ? "Connecting..." : connected ? "Disconnect" : showCreds?.id === p.id ? "Authenticate" : "Connect"}
                  </button>
                  {showCreds?.id === p.id && (
                    <button onClick={() => setShowCreds(null)}
                      className="py-2 px-4 rounded-lg bg-stone-800 text-stone-400 hover:text-white font-bold text-[10px] transition-all"
                    >Cancel</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Page navigation at bottom */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 pt-4">
          {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => {
            const start = Math.max(0, Math.min(page - 4, totalPages - 10));
            const pg = start + i;
            if (pg >= totalPages) return null;
            return (
              <button key={pg} onClick={() => setPage(pg)}
                className={`w-8 h-8 rounded-lg text-[10px] font-bold transition-all ${
                  pg === page ? "bg-emerald-600 text-white" : "bg-stone-900 text-stone-400 hover:bg-stone-800"
                }`}
              >{pg + 1}</button>
            );
          })}
        </div>
      )}

      {/* Credentials Modal */}
      {showCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setShowCreds(null)}>
          <div className="bg-stone-950 border border-stone-800 rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-stone-800">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{typeof showCreds.icon === "string" && showCreds.icon.length <= 3 ? showCreds.icon : "🔌"}</span>
                <div>
                  <h2 className="text-lg font-black text-white">Connect to {showCreds.name}</h2>
                  <p className="text-stone-500 text-xs font-mono mt-0.5">{showCreds.category} · Enter your credentials</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">API Key / Access Token <span className="text-rose-400">*</span></label>
                <input type="text" placeholder="sk-... or xoxb-..." value={creds.apiKey}
                  onChange={e => setCreds({ ...creds, apiKey: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">API Secret</label>
                <input type="text" placeholder="Optional" value={creds.apiSecret}
                  onChange={e => setCreds({ ...creds, apiSecret: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Client ID</label>
                  <input type="text" placeholder="OAuth" value={creds.clientId}
                    onChange={e => setCreds({ ...creds, clientId: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Client Secret</label>
                  <input type="text" placeholder="OAuth" value={creds.clientSecret}
                    onChange={e => setCreds({ ...creds, clientSecret: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Access Token (pre-obtained)</label>
                <input type="text" placeholder="Bearer token" value={creds.accessToken}
                  onChange={e => setCreds({ ...creds, accessToken: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Username</label>
                  <input type="text" placeholder="Basic auth" value={creds.username}
                    onChange={e => setCreds({ ...creds, username: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Password</label>
                  <input type="password" placeholder="Basic auth" value={creds.password}
                    onChange={e => setCreds({ ...creds, password: e.target.value })}
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3 py-2.5 text-white text-xs outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
                  />
                </div>
              </div>
              <p className="text-[9px] text-stone-500 font-mono text-center">At least one field (API Key, Client ID, Access Token, or Username) is required</p>
            </div>
            <div className="p-4 border-t border-stone-800 flex gap-3">
              <button onClick={() => setShowCreds(null)}
                className="flex-1 py-3 rounded-xl bg-stone-900 text-stone-400 hover:text-white font-bold text-sm transition-all border border-stone-800"
              >Cancel</button>
              <button onClick={() => handleConnect(showCreds)}
                disabled={connecting === showCreds.id || (!creds.apiKey.trim() && !creds.clientId.trim() && !creds.accessToken.trim() && !creds.username.trim())}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting === showCreds.id ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-800 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 font-mono text-xs animate-slideUp">
          <span className={feedback.startsWith("✓") ? "text-emerald-400" : "text-red-400"}>●</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}
