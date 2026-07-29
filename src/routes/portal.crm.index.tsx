import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PROVIDERS } from "~/data/providers";

export const Route = createFileRoute("/portal/crm/")({
  component: CRMERPPortal,
});

interface ProviderItem {
  id: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
}

interface ConnectionItem {
  id: string;
  provider: string;
  providerId: string;
  status: string;
}

function CRMERPPortal() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | "CRM" | "ERP">("all");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>(PROVIDERS as any); // preloaded for SSR
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(false); // providers render immediately
  const [error, setError] = useState<string | null>(null);

  // Fetch real providers and connections
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [providersRes, connsRes] = await Promise.all([
          fetch("/api/integrations/providers"),
          fetch("/api/integrations")
        ]);
        const provsData = await providersRes.json();
        const connsData = await connsRes.json();
        const allProviders: ProviderItem[] = provsData.data || provsData || [];
        // Filter to CRM/ERP categories
        const crmErp = allProviders.filter(p => {
          const cat = (p.category || "").toLowerCase();
          return cat.includes("crm") || cat.includes("erp") || cat.includes("accounting");
        });
        setProviders(crmErp);
        setConnections(connsData.data || connsData || []);
      } catch (err) {
        console.error("Error fetching CRM/ERP data:", err);
        setError("Failed to load CRM/ERP providers. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filtered = providers.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === "all" ||
      p.category.toLowerCase().includes(category.toLowerCase());
    return matchesSearch && matchesCat;
  });

  const connectedCount = connections.filter(c => {
    const provider = providers.find(p => p.id === c.providerId);
    if (!provider) return false;
    const cat = (provider.category || "").toLowerCase();
    return cat.includes("crm") || cat.includes("erp") || cat.includes("accounting");
  }).length;

  const handleConnect = async (providerId: string) => {
    setConnecting(providerId);
    try {
      const provider = providers.find(p => p.id === providerId);
      const res = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          providerName: provider?.name || providerId,
          credentials: { apiKey: prompt(`Enter API key for ${provider?.name || providerId}:`) || "" },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConnections(prev => [...prev, data.connection]);
      } else {
        alert(data.error || "Connection failed");
      }
    } catch (err) {
      console.error("Connect error:", err);
      alert("Connection failed. Please try again.");
    } finally {
      setConnecting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <p className="text-stone-400 font-bold">{error}</p>
        <button onClick={() => window.location.reload()} className="text-emerald-400 font-bold text-sm hover:text-emerald-300">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">CRM & ERP Connections</h1>
        <p className="text-stone-400 mt-1">Connect your customer and enterprise resource planning systems for AI-powered automation.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "CRM/ERP Providers", value: String(providers.length), color: "text-blue-400" },
          { label: "Connected", value: String(connectedCount), color: "text-white" },
          { label: "Total Connections", value: String(connections.length), color: "text-emerald-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          placeholder="Search providers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
        />
        <div className="flex gap-2">
          {(["all", "CRM", "ERP"] as const).map(c => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                category === c
                  ? "bg-emerald-600 text-white"
                  : "bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800"
              }`}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
      </div>

      {/* Provider Grid */}
      {providers.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔌</div>
          <p className="font-bold">No CRM or ERP providers available</p>
          <p className="text-sm mt-1">Check your connection or browse all integrations.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔍</div>
          <p className="font-bold">No providers match your search</p>
          <p className="text-sm mt-1">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(provider => {
            const isConnected = connections.some(c => c.providerId === provider.id);
            return (
              <div
                key={provider.id}
                className="bg-stone-900 border border-stone-800 rounded-2xl p-6 hover:border-stone-700 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{provider.icon || "🔌"}</span>
                    <div>
                      <div className="font-bold text-white text-sm">{provider.name}</div>
                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
                        {provider.category}
                      </span>
                    </div>
                  </div>
                  <div className={`w-2 h-2 rounded-full transition-colors ${isConnected ? "bg-emerald-500" : "bg-stone-600 group-hover:bg-emerald-500"}`} title={isConnected ? "Connected" : "Available"} />
                </div>
                <button
                  onClick={() => handleConnect(provider.id)}
                  disabled={connecting === provider.id || isConnected}
                  className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                    isConnected
                      ? "bg-emerald-600/20 text-emerald-400 cursor-default"
                      : "bg-stone-800 text-stone-300 hover:bg-emerald-600 hover:text-white"
                  } disabled:opacity-50`}
                >
                  {isConnected ? "✓ Connected" : connecting === provider.id ? "Connecting..." : "Connect"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Support Note */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 text-center">
        <h3 className="text-white font-bold mb-2">Don't see your CRM or ERP?</h3>
        <p className="text-stone-400 text-sm mb-4">
          We integrate with 180+ business platforms. If your system isn't listed here, it may be available through our universal connector.
        </p>
        <Link to="/portal/integrations" className="inline-block text-emerald-400 font-bold text-sm hover:text-emerald-300">
          Browse All Integrations →
        </Link>
      </div>
    </div>
  );
}
