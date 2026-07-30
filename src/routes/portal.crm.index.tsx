import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";

export const Route = createFileRoute("/portal/crm/")({
  component: CRMPortal,
});

interface ProviderItem {
  id: string;
  name: string;
  category: string;
  icon?: string;
  description?: string;
  connectionRequirements?: {
    authType: string;
    scopes: string[];
    apiKeyType: string;
    prerequisites: string[];
  } | null;
}

interface ConnectionItem {
  id: string;
  provider: string;
  providerId: string;
  status: string;
}

interface SlotInfo {
  totalSlots: number;
  usedSlots: number;
  remainingSlots: number;
  isOwner: boolean;
}

const CRM_CATEGORIES = ["CRM"];

function CRMPortal() {
  const [search, setSearch] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [slots, setSlots] = useState<SlotInfo>({ totalSlots: 0, usedSlots: 0, remainingSlots: 0, isOwner: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [providersRes, connsRes, slotsRes] = await Promise.all([
        fetch("/api/integrations/providers"),
        fetch("/api/integrations"),
        fetch("/api/data/crm-slots"),
      ]);

      const provsData = await providersRes.json();
      const connsData = await connsRes.json();
      const slotsData = await slotsRes.json();

      // Filter to CRM only
      const allProviders: ProviderItem[] = provsData.data || provsData || [];
      const crmProviders = allProviders.filter(p => {
        if (p == null) return false;
        const cat = (p.category || "").toLowerCase();
        return CRM_CATEGORIES.some(c => cat.includes(c.toLowerCase()));
      });

      setProviders(crmProviders);
      setConnections(connsData.data || connsData || []);
      setSlots(slotsData);
    } catch (err) {
      console.error("Error fetching CRM data:", err);
      setError("Failed to load CRM providers. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = providers.filter(p => p != null && p.name.toLowerCase().includes(search.toLowerCase()));

  const crmConnections = connections.filter(c => {
    const provider = providers.find(p => p.id === c.providerId);
    if (!provider) return false;
    const cat = (provider.category || "").toLowerCase();
    return CRM_CATEGORIES.some(catPrefix => cat.includes(catPrefix.toLowerCase()));
  });

  const handleConnect = async (providerId: string, providerCategory: string) => {
    setConnecting(providerId);
    try {
      const provider = providers.find(p => p.id === providerId);
      const apiKey = prompt(`Enter API key for ${provider?.name || providerId}:`);
      if (!apiKey?.trim()) {
        setConnecting(null);
        return;
      }

      const res = await fetch("/api/integrations/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          providerName: provider?.name || providerId,
          category: providerCategory,
          credentials: { apiKey: apiKey.trim() },
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setConnections(prev => [...prev, data.connection]);
        // Refresh slots
        const slotsRes = await fetch("/api/data/crm-slots");
        setSlots(await slotsRes.json());
      } else if (res.status === 402) {
        alert(data.error || "Purchase required. Visit the marketplace to buy CRM connection slots.");
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

  const handleDisconnect = async (connectionId: string, providerName: string) => {
    if (!confirm(`Disconnect ${providerName}? This will free up a CRM slot.`)) return;
    setDisconnecting(connectionId);
    try {
      const res = await fetch("/api/integrations/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });
      if (res.ok) {
        setConnections(prev => prev.filter(c => c.id !== connectionId));
        const slotsRes = await fetch("/api/data/crm-slots");
        setSlots(await slotsRes.json());
      } else {
        const data = await res.json();
        alert(data.error || "Disconnect failed");
      }
    } catch (err) {
      console.error("Disconnect error:", err);
      alert("Disconnect failed.");
    } finally {
      setDisconnecting(null);
    }
  };

  const canConnect = slots.isOwner || slots.remainingSlots > 0;

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
        <button onClick={fetchData} className="text-emerald-400 font-bold text-sm hover:text-emerald-300">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">CRM Connections</h1>
        <p className="text-stone-400 mt-1">Connect your customer relationship management systems for AI-powered automation.</p>
      </div>

      {/* Slot Availability Banner */}
      <div className={`rounded-2xl p-5 border ${canConnect ? "bg-emerald-950/20 border-emerald-900/50" : "bg-amber-950/20 border-amber-900/50"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`text-3xl font-black ${canConnect ? "text-emerald-400" : "text-amber-400"}`}>
              {crmConnections.length}{" "}
              <span className="text-lg font-normal text-stone-400">/ {slots.isOwner ? "∞" : slots.totalSlots} connections</span>
            </div>
            {!slots.isOwner && (
              <div className="text-sm">
                <span className={`font-bold ${slots.remainingSlots > 0 ? "text-emerald-400" : "text-amber-400"}`}>
                  {slots.remainingSlots} slot{slots.remainingSlots !== 1 ? "s" : ""} remaining
                </span>
              </div>
            )}
          </div>
          {!slots.isOwner && slots.remainingSlots === 0 && (
            <Link
              to="/portal/marketplace"
              className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl font-bold text-sm transition-all"
            >
              Upgrade →
            </Link>
          )}
        </div>
      </div>

      {/* Connected Accounts Banner */}
      {crmConnections.length > 0 && (
        <div className="bg-emerald-950/10 border border-emerald-900/30 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-emerald-400 font-bold text-sm">
              ✅ {crmConnections.length} CRM account{crmConnections.length !== 1 ? "s" : ""} connected
            </span>
          </div>
          <Link
            to="/portal/connected-accounts"
            className="text-emerald-400 font-bold text-sm hover:text-emerald-300"
          >
            Manage in Connected Accounts →
          </Link>
        </div>
      )}

      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Search CRM providers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-emerald-500 transition-colors placeholder:text-stone-600"
        />
      </div>

      {/* Provider Grid — Available to connect (connected providers are managed in Connected Accounts) */}
      {providers.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔌</div>
          <p className="font-bold">No CRM providers available</p>
          <p className="text-sm mt-1">Check your connection or browse all integrations.</p>
        </div>
      ) : (() => {
        const unconnectedProviders = filtered.filter(p => !connections.some(c => c.providerId === p.id));
        return unconnectedProviders.length === 0 ? (
          <div className="text-center py-16 text-stone-500">
            <div className="text-4xl mb-4">✅</div>
            <p className="font-bold">All available CRM providers are connected</p>
            <p className="text-sm mt-1">
              <Link to="/portal/connected-accounts" className="text-emerald-400 hover:text-emerald-300 font-bold">Manage your connections →</Link>
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unconnectedProviders.map(provider => {
              const reqs = provider.connectionRequirements;
              const isExpanded = expandedProvider === provider.id;

              return (
                <div
                  key={provider.id}
                  className="bg-stone-900 border border-stone-800 hover:border-stone-700 rounded-2xl p-6 transition-all group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{provider.icon || "💼"}</span>
                      <div>
                        <div className="font-bold text-white text-sm">{provider.name}</div>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
                          {provider.category}
                        </span>
                      </div>
                    </div>
                    <div className="w-2 h-2 rounded-full bg-stone-600" title="Available" />
                  </div>

                  {/* Connection Requirements */}
                  {reqs && (
                    <div className="mb-4">
                      <button
                        onClick={() => setExpandedProvider(isExpanded ? null : provider.id)}
                        className="text-[10px] font-mono text-stone-500 hover:text-stone-300 underline mb-2"
                      >
                        {isExpanded ? "Hide requirements ▲" : "View requirements ▼"}
                      </button>
                      {isExpanded && (
                        <div className="bg-stone-950 rounded-xl p-3 space-y-2 text-[10px] font-mono">
                          <div>
                            <span className="text-stone-500">Auth: </span>
                            <span className="text-stone-300 font-bold">{reqs.authType}</span>
                          </div>
                          {reqs.scopes?.length > 0 && (
                            <div>
                              <span className="text-stone-500">Scopes: </span>
                              <span className="text-stone-400">{reqs.scopes.join(", ")}</span>
                            </div>
                          )}
                          <div>
                            <span className="text-stone-500">Key type: </span>
                            <span className="text-stone-400">{reqs.apiKeyType}</span>
                          </div>
                          {reqs.prerequisites?.length > 0 && (
                            <div>
                              <span className="text-stone-500">Required: </span>
                              <span className="text-stone-400">{reqs.prerequisites.join(" · ")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => handleConnect(provider.id, provider.category)}
                    disabled={connecting === provider.id || (!slots.isOwner && slots.remainingSlots === 0)}
                    className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                      !canConnect
                        ? "bg-stone-800 text-stone-500 cursor-not-allowed"
                        : "bg-stone-800 text-stone-300 hover:bg-emerald-600 hover:text-white"
                    } disabled:opacity-50`}
                  >
                    {!canConnect ? "No slots available" : connecting === provider.id ? "Connecting..." : "Connect"}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Upgrade / Browse All */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 text-center">
        <h3 className="text-white font-bold mb-2">Don't see your CRM?</h3>
        <p className="text-stone-400 text-sm mb-4">
          We integrate with 180+ business platforms. If your system isn't listed here, it may be available through our universal connector.
        </p>
        <div className="flex justify-center gap-4">
          <Link to="/portal/integrations" className="text-emerald-400 font-bold text-sm hover:text-emerald-300">
            Browse All Integrations →
          </Link>
          {!slots.isOwner && slots.remainingSlots === 0 && (
            <Link to="/portal/marketplace" className="text-amber-400 font-bold text-sm hover:text-amber-300">
              Get More Slots →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
