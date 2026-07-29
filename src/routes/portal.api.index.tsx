import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/api/")({
  component: DeveloperPortal,
});

interface ApiKeyItem {
  name: string;
  type: string;
  value: string;
  _id?: string;
  connectionName?: string;
  providerId?: string;
  createdAt?: string;
}

function DeveloperPortal() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyConnection, setNewKeyConnection] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/data/api", { credentials: "include" }).then(r => r.json()),
      fetch("/api/integrations", { credentials: "include" }).then(r => r.json()),
    ]).then(([keysData, connsData]) => {
      const rawKeys = keysData.data || [];
      const conns = connsData.data || [];
      setConnections(conns);

      // Link keys to connections by matching providerId or name
      const linked = rawKeys.map((k: any) => {
        const conn = conns.find((c: any) => 
          c.providerId === k.providerId || c.provider === k.name || c.name === k.connectionName
        );
        return {
          ...k,
          connectionName: conn?.provider || conn?.displayName || k.connectionName || "—",
          providerId: conn?.providerId || k.providerId || "",
        };
      });
      setKeys(linked);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Mask key: show only first 4 and last 4 characters
  const maskKey = (key: string): string => {
    if (!key || key.length <= 8) return "••••••••";
    return key.slice(0, 7) + "..." + key.slice(-4);
  };

  const handleGenerate = async () => {
    if (!newKeyName.trim()) {
      setFeedback("Please enter a key name");
      return;
    }
    try {
      setFeedback("Generating API key...");
      const newKey = "sk_live_" + Math.random().toString(36).substr(2, 32) + Math.random().toString(36).substr(2, 8);
      const keyObj: ApiKeyItem = {
        name: newKeyName.trim(),
        type: "API Key",
        value: newKey,
        connectionName: newKeyConnection || undefined,
        providerId: newKeyConnection || undefined,
        createdAt: new Date().toISOString(),
      };

      const res = await fetch("/api/data/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(keyObj),
      });
      if (res.ok) {
        setKeys(prev => [keyObj, ...prev]);
        setFeedback("✓ API key generated! Copy it now — it won't be shown again.");
        setShowNewKey(false);
        setNewKeyName("");
        setNewKeyConnection("");
      } else {
        setFeedback("Failed to save key");
      }
    } catch (err) {
      setFeedback("Failed to generate key");
    }
    setTimeout(() => setFeedback(""), 5000);
  };

  const handleRevoke = async (keyName: string, idx: number) => {
    if (!confirm(`Revoke key "${keyName}"? This action cannot be undone.`)) return;
    try {
      setFeedback(`Revoking key...`);
      await fetch("/api/data/api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "revoke", resource: keyName }),
      });
      setKeys(prev => prev.filter((_, i) => i !== idx));
      setFeedback("✓ Key revoked");
    } catch { setFeedback("Failed to revoke"); }
    setTimeout(() => setFeedback(""), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans max-w-6xl mx-auto text-stone-100">
      <div className="border-b border-stone-900 pb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">🔑 Developer Gateway</h1>
          <p className="text-stone-400 mt-1 text-sm">Manage API authorization tokens, linked to your connected integrations.</p>
        </div>
        <button
          onClick={() => setShowNewKey(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg transition-all"
        >
          🔑 Generate API Key
        </button>
      </div>

      {/* Generate New Key Form */}
      {showNewKey && (
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
          <h3 className="text-sm font-black text-white">Generate New API Key</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                placeholder="e.g. Salesforce Sync Key"
                className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-sm text-white placeholder-stone-600 outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-stone-500 mb-1">Linked Connection (optional)</label>
              <select
                value={newKeyConnection}
                onChange={e => setNewKeyConnection(e.target.value)}
                className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-600"
              >
                <option value="">No connection</option>
                {connections.map((c: any) => (
                  <option key={c.id} value={c.providerId || c.provider}>{c.provider || c.displayName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowNewKey(false)} className="bg-stone-900 hover:bg-stone-800 text-stone-400 px-4 py-2 rounded-xl text-xs font-bold">Cancel</button>
            <button onClick={handleGenerate} className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold">Generate Key</button>
          </div>
        </div>
      )}

      {/* Keys Table */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl overflow-hidden">
        <table className="w-full text-left text-xs font-semibold">
          <thead>
            <tr className="bg-stone-900/60 text-stone-400 border-b border-stone-800 uppercase tracking-wider text-[10px] font-mono">
              <th className="p-4 font-bold">Connection</th>
              <th className="p-4 font-bold">Key Name</th>
              <th className="p-4 font-bold">Key (masked)</th>
              <th className="p-4 font-bold">Created</th>
              <th className="p-4 font-bold">Status</th>
              <th className="p-4 text-right font-bold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-900/50 font-semibold text-stone-300">
            {keys.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-stone-500">
                  <div className="text-3xl mb-3">🔑</div>
                  <p className="font-bold">No API keys generated yet</p>
                  <p className="text-xs mt-1">Generate an API key to authenticate with the Simpler Life 100 API.</p>
                </td>
              </tr>
            ) : (
              keys.map((k, idx) => (
                <tr key={idx} className="hover:bg-stone-900/20">
                  <td className="p-4 font-extrabold text-white text-sm">
                    {k.connectionName && k.connectionName !== "—" ? (
                      <Link to="/portal/integrations" className="text-blue-400 hover:text-blue-300 underline">{k.connectionName}</Link>
                    ) : (
                      <span className="text-stone-500">{k.connectionName || "—"}</span>
                    )}
                  </td>
                  <td className="p-4 text-white font-bold text-sm">{k.name}</td>
                  <td className="p-4 font-mono text-[10px] text-stone-400">{maskKey(k.value)}</td>
                  <td className="p-4 text-stone-500 text-[11px]">{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "—"}</td>
                  <td className="p-4">
                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded border bg-emerald-950/40 text-emerald-400 border-emerald-900/40">
                      Active
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleRevoke(k.name, idx)} className="text-rose-400 hover:text-rose-300 font-bold text-xs">Revoke</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}
