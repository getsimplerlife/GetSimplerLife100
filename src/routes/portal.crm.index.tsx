import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/crm/")({
  component: CRMERPPortal,
});

const crmProviders = [
  { id: "salesforce", name: "Salesforce", icon: "☁️", category: "CRM" },
  { id: "hubspot", name: "HubSpot", icon: "🧲", category: "CRM" },
  { id: "ms-dynamics-365", name: "Microsoft Dynamics 365", icon: "🔷", category: "CRM+ERP" },
  { id: "zoho", name: "Zoho CRM", icon: "📋", category: "CRM" },
  { id: "pipedrive", name: "Pipedrive", icon: "📌", category: "CRM" },
  { id: "freshsales", name: "Freshsales", icon: "🌿", category: "CRM" },
  { id: "sugarcrm", name: "SugarCRM", icon: "🍬", category: "CRM" },
  { id: "zendesk-sell", name: "Zendesk Sell", icon: "🎯", category: "CRM" },
  { id: "oracle-netsuite", name: "Oracle NetSuite", icon: "🔴", category: "ERP" },
  { id: "sap", name: "SAP S/4HANA", icon: "💎", category: "ERP" },
  { id: "oracle-cx", name: "Oracle CX", icon: "🔶", category: "CRM+ERP" },
  { id: "workday", name: "Workday", icon: "👔", category: "ERP" },
];

function CRMERPPortal() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | "CRM" | "ERP">("all");
  const [connectedIds, setConnectedIds] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string | null>(null);
  const [showCreds, setShowCreds] = useState<string | null>(null);
  const [creds, setCreds] = useState({ apiKey: "", apiSecret: "", clientId: "", clientSecret: "", accessToken: "", username: "", password: "" });
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/integrations", { credentials: "include" });
        if (res.ok) {
          const json = await res.json();
          setConnectedIds(new Set((json.data || []).map((c: any) => c.providerId || c.provider)));
        }
      } catch {}
    })();
  }, []);

  const filtered = crmProviders.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === "all" || p.category.includes(category);
    return matchesSearch && matchesCat;
  });

  const handleConnect = async (provider: typeof crmProviders[0]) => {
    if (showCreds !== provider.id) {
      setShowCreds(provider.id);
      setCreds({ apiKey: "", apiSecret: "", clientId: "", clientSecret: "", accessToken: "", username: "", password: "" });
      return;
    }
    setConnecting(provider.id);
    try {
      // Build credentials — only include non-empty fields
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
  };

  const handleDisconnect = async (provider: typeof crmProviders[0]) => {
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
  };

  const connectedCount = crmProviders.filter(p => connectedIds.has(p.id)).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">CRM & ERP Connections</h1>
        <p className="text-stone-400 mt-1">Connect your customer and enterprise resource planning systems for AI-powered automation.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "CRM Providers", value: "8", color: "text-blue-400" },
          { label: "ERP Providers", value: "4", color: "text-emerald-400" },
          { label: "Connected", value: String(connectedCount), color: "text-white" },
          { label: "Actions Available", value: "60+", color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <input type="text" placeholder="Search providers..." value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
        />
        <div className="flex gap-2">
          {(["all", "CRM", "ERP"] as const).map(c => (
            <button key={c} onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                category === c ? "bg-emerald-600 text-white" : "bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800"
              }`}
            >{c === "all" ? "All" : c}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔌</div>
          <p className="font-bold">No providers found</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(provider => {
            const connected = connectedIds.has(provider.id);
            return (
              <div key={provider.id}
                className={`bg-stone-900 border rounded-2xl p-6 hover:border-stone-700 transition-all group ${
                  connected ? "border-emerald-900/50" : "border-stone-800"
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{provider.icon}</span>
                    <div>
                      <div className="font-bold text-white text-sm">{provider.name}</div>
                      <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        provider.category === "CRM" ? "bg-blue-500/10 text-blue-400" :
                        provider.category === "ERP" ? "bg-emerald-500/10 text-emerald-400" :
                        "bg-amber-500/10 text-amber-400"
                      }`}>{provider.category}</span>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full transition-colors ${connected ? "bg-emerald-500" : "bg-stone-600 group-hover:bg-emerald-500"}`} />
                </div>

                {/* Credential fields */}
                {showCreds === provider.id && !connected && (
                  <div className="mb-4 space-y-2.5 bg-stone-950 rounded-xl p-4 border border-stone-800">
                    <input type="text" placeholder="API Key / Access Token (required)" value={creds.apiKey}
                      onChange={e => setCreds({ ...creds, apiKey: e.target.value })}
                      className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 placeholder:text-stone-600"
                    />
                    <input type="text" placeholder="API Secret" value={creds.apiSecret}
                      onChange={e => setCreds({ ...creds, apiSecret: e.target.value })}
                      className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 placeholder:text-stone-600"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Client ID" value={creds.clientId}
                        onChange={e => setCreds({ ...creds, clientId: e.target.value })}
                        className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 placeholder:text-stone-600"
                      />
                      <input type="text" placeholder="Client Secret" value={creds.clientSecret}
                        onChange={e => setCreds({ ...creds, clientSecret: e.target.value })}
                        className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 placeholder:text-stone-600"
                      />
                    </div>
                    <input type="text" placeholder="Access Token (pre-obtained)" value={creds.accessToken}
                      onChange={e => setCreds({ ...creds, accessToken: e.target.value })}
                      className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 placeholder:text-stone-600"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" placeholder="Username (basic auth)" value={creds.username}
                        onChange={e => setCreds({ ...creds, username: e.target.value })}
                        className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 placeholder:text-stone-600"
                      />
                      <input type="password" placeholder="Password (basic auth)" value={creds.password}
                        onChange={e => setCreds({ ...creds, password: e.target.value })}
                        className="bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-white text-xs outline-none focus:border-emerald-500 placeholder:text-stone-600"
                      />
                    </div>
                    <p className="text-[8px] text-stone-600 font-mono text-center pt-1">At least one field required</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => connected ? handleDisconnect(provider) : handleConnect(provider)}
                    disabled={connecting === provider.id}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm transition-all ${
                      connected
                        ? "bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20"
                        : "bg-stone-800 text-stone-300 hover:bg-emerald-600 hover:text-white"
                    } disabled:opacity-50`}
                  >
                    {connecting === provider.id ? "Connecting..." : connected ? "Disconnect" : showCreds === provider.id ? "Authenticate" : "Connect"}
                  </button>
                  {showCreds === provider.id && (
                    <button onClick={() => setShowCreds(null)}
                      className="py-2.5 px-4 rounded-xl bg-stone-800 text-stone-400 hover:text-white font-bold text-sm transition-all"
                    >Cancel</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 text-center">
        <h3 className="text-white font-bold mb-2">Don't see your CRM or ERP?</h3>
        <p className="text-stone-400 text-sm mb-4">
          We integrate with 180+ business platforms. If your system isn't listed here, it may be available through our universal connector.
        </p>
        <Link to="/portal/integrations" className="inline-block text-emerald-400 font-bold text-sm hover:text-emerald-300">
          Browse All Integrations →
        </Link>
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-800 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 font-mono text-xs">
          <span className={feedback.startsWith("✓") ? "text-emerald-400" : "text-red-400"}>●</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}
