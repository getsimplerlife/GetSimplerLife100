import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PROVIDERS } from "~/data/providers";

export const Route = createFileRoute("/portal/erp/")({
  component: ERPPortal,
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

function ERPPortal() {
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>(PROVIDERS as any); // preloaded for SSR
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(false); // providers render immediately
  const [error, setError] = useState<string | null>(null);
  const [purchaseGated, setPurchaseGated] = useState(false);

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

        // Handle 402 purchase gating
        if (providersRes.status === 402 || connsRes.status === 402) {
          setPurchaseGated(true);
          setLoading(false);
          return;
        }

        const provsData = await providersRes.json();
        const connsData = await connsRes.json();
        const allProviders: ProviderItem[] = provsData.data || provsData || [];
        // Filter to ERP/accounting only (no CRM)
        const erpOnly = allProviders.filter(p => {
          const cat = (p.category || "").toLowerCase();
          return cat.includes("erp") || cat.includes("accounting") || cat.includes("finance");
        });
        setProviders(erpOnly);
        setConnections(connsData.data || connsData || []);
      } catch (err) {
        console.error("Error fetching ERP data:", err);
        setError("Failed to load ERP providers. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (purchaseGated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center space-y-6">
        <div className="text-5xl">🔐</div>
        <h2 className="text-2xl font-black text-white">ERP Access Requires Purchase</h2>
        <p className="text-stone-400 max-w-md">
          ERP integrations require an active AI employee or builder package. Browse our marketplace to get started.
        </p>
        <Link
          to="/portal/marketplace"
          className="inline-flex items-center bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all"
        >
          Browse Marketplace →
        </Link>
      </div>
    );
  }

  const filtered = providers.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const connectedCount = connections.filter(c => {
    const provider = providers.find(p => p.id === c.providerId);
    if (!provider) return false;
    const cat = (provider.category || "").toLowerCase();
    return cat.includes("erp") || cat.includes("accounting") || cat.includes("finance");
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
        <h1 className="text-2xl font-black text-white tracking-tight">ERP & Accounting Connections</h1>
        <p className="text-stone-400 mt-1">Connect your enterprise resource planning and accounting systems for AI-powered financial automation.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { label: "ERP Providers", value: String(providers.length), color: "text-amber-400" },
          { label: "Connected", value: String(connectedCount), color: "text-white" },
          { label: "Total Connections", value: String(connections.length), color: "text-emerald-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search ERP providers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
        />
      </div>

      {/* Provider Grid */}
      {providers.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔌</div>
          <p className="font-bold">No ERP or accounting providers available</p>
          <p className="text-sm mt-1">Check your connection or browse all integrations.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔍</div>
          <p className="font-bold">No providers match your search</p>
          <p className="text-sm mt-1">Try a different search term.</p>
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
        <h3 className="text-white font-bold mb-2">Don't see your ERP or accounting system?</h3>
        <p className="text-stone-400 text-sm mb-4">
          We integrate with 180+ business platforms including SAP, NetSuite, QuickBooks, Xero, and more. If your system isn't listed here, it may be available through our universal connector.
        </p>
        <Link to="/portal/integrations" className="inline-block text-emerald-400 font-bold text-sm hover:text-emerald-300">
          Browse All Integrations →
        </Link>
      </div>
    </div>
  );
}
