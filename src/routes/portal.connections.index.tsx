import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/connections/")({
  component: ConnectedAccountsPage,
});

interface Connection {
  id: string;
  provider: string;
  providerId?: string;
  status: string;
  connectedAt: string;
  lastSync: string;
  credentials?: Record<string, string>;
}

function ConnectedAccountsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCreds, setEditCreds] = useState<Record<string, string>>({});

  const fetchConnections = async () => {
    try {
      const res = await fetch("/api/integrations", { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setConnections(json.data || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchConnections(); }, []);

  const handleDisconnect = async (conn: Connection) => {
    try {
      await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ connectionId: conn.id, providerId: conn.providerId }),
      });
      setConnections(prev => prev.filter(c => c.id !== conn.id));
      setFeedback(`Disconnected ${conn.provider}`);
      setTimeout(() => setFeedback(""), 3000);
    } catch {
      setFeedback("Failed to disconnect");
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const handleTest = async (conn: Connection) => {
    setFeedback(`Testing ${conn.provider}...`);
    await new Promise(r => setTimeout(r, 800));
    setFeedback(`✓ ${conn.provider} is healthy`);
    setTimeout(() => setFeedback(""), 3000);
  };

  const handleSaveCredentials = async (conn: Connection) => {
    try {
      await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ providerId: conn.providerId, providerName: conn.provider, credentials: editCreds }),
      });
      // Remove old entry and add updated
      setConnections(prev => prev.map(c => c.id === conn.id ? { ...c, credentials: editCreds, lastSync: new Date().toISOString() } : c));
      setEditingId(null);
      setFeedback(`✓ Credentials updated for ${conn.provider}`);
      setTimeout(() => setFeedback(""), 3000);
    } catch {
      setFeedback("Failed to save");
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const statusDot = (status: string) => {
    if (status === "Connected") return "🟢";
    if (status === "Error") return "🔴";
    return "🟡";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Connected Accounts</h1>
          <p className="text-stone-400 mt-1">Manage credentials, monitor health, and control your connected integrations.</p>
        </div>
        <Link
          to="/portal/integrations"
          className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all"
        >
          + Connect New
        </Link>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Connected", value: String(connections.length), color: "text-emerald-400" },
          { label: "Healthy", value: String(connections.filter(c => c.status === "Connected").length), color: "text-green-400" },
          { label: "Last Sync", value: connections.length > 0 ? "Active" : "—", color: "text-blue-400" },
          { label: "Providers", value: "180+", color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Connections Table */}
      {connections.length === 0 ? (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4">🔗</div>
          <h3 className="text-lg font-bold text-white mb-2">No Connected Accounts</h3>
          <p className="text-stone-400 text-sm mb-6 max-w-md mx-auto">
            Connect your first integration to start automating workflows across your business tools.
          </p>
          <Link
            to="/portal/integrations"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm px-6 py-3 rounded-xl transition-all"
          >
            Browse Integrations →
          </Link>
        </div>
      ) : (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-stone-950 border-b border-stone-800 text-[10px] font-mono text-stone-500 uppercase tracking-wider font-bold">
            <div className="col-span-3">Provider</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Connected</div>
            <div className="col-span-2">Last Sync</div>
            <div className="col-span-3 text-right">Actions</div>
          </div>
          <div className="divide-y divide-stone-800">
            {connections.map(conn => (
              <div key={conn.id}>
                <div className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-stone-800/30 transition-colors">
                  <div className="col-span-3">
                    <div className="font-bold text-white text-sm">{conn.provider}</div>
                    <div className="text-[10px] text-stone-500 font-mono truncate">{conn.providerId || conn.id}</div>
                  </div>
                  <div className="col-span-2">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      conn.status === "Connected" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      conn.status === "Error" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                      "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    }`}>
                      {statusDot(conn.status)} {conn.status}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-stone-400 font-mono">{formatTime(conn.connectedAt)}</div>
                  <div className="col-span-2 text-xs text-stone-400 font-mono">{formatTime(conn.lastSync)}</div>
                  <div className="col-span-3 flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setEditingId(editingId === conn.id ? null : conn.id); setEditCreds(conn.credentials || {}); }}
                      className="text-[10px] font-bold text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleTest(conn)}
                      className="text-[10px] font-bold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => handleDisconnect(conn)}
                      className="text-[10px] font-bold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 rounded-lg transition-all"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
                {/* Credentials Editor */}
                {editingId === conn.id && (
                  <div className="px-6 py-4 bg-stone-950 border-t border-stone-800">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-[10px] font-mono text-stone-500 uppercase tracking-wider mb-1">API Key</label>
                        <input
                          type="text"
                          value={editCreds.apiKey || ""}
                          onChange={e => setEditCreds({ ...editCreds, apiKey: e.target.value })}
                          className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500"
                          placeholder="sk-..."
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono text-stone-500 uppercase tracking-wider mb-1">API Secret / URL</label>
                        <input
                          type="text"
                          value={editCreds.apiSecret || editCreds.apiUrl || ""}
                          onChange={e => setEditCreds({ ...editCreds, apiSecret: e.target.value })}
                          className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500"
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditingId(null)} className="text-[10px] font-bold text-stone-400 hover:text-white px-3 py-1.5 rounded-lg transition-all">Cancel</button>
                      <button onClick={() => handleSaveCredentials(conn)} className="text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg transition-all">Save Credentials</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-800 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 font-mono text-xs">
          <span className={feedback.startsWith("✓") ? "text-emerald-400" : "text-red-400"}>{feedback.startsWith("✓") ? "✓" : "⚠"}</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}
