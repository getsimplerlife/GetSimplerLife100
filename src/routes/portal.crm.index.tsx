import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/crm/")({
  component: CRMERPPortal,
});

const crmProviders = [
  { id: "salesforce", name: "Salesforce", icon: "☁️", category: "CRM", status: "available" },
  { id: "hubspot", name: "HubSpot", icon: "🧲", category: "CRM", status: "available" },
  { id: "ms-dynamics-365", name: "Microsoft Dynamics 365", icon: "🔷", category: "CRM+ERP", status: "available" },
  { id: "zoho", name: "Zoho CRM", icon: "📋", category: "CRM", status: "available" },
  { id: "pipedrive", name: "Pipedrive", icon: "📌", category: "CRM", status: "available" },
  { id: "freshsales", name: "Freshsales", icon: "🌿", category: "CRM", status: "available" },
  { id: "oracle-netsuite", name: "Oracle NetSuite", icon: "🔴", category: "ERP", status: "available" },
  { id: "sap", name: "SAP", icon: "💎", category: "ERP", status: "available" },
  { id: "workday", name: "Workday", icon: "👔", category: "ERP", status: "available" },
  { id: "quickbooks", name: "QuickBooks", icon: "📗", category: "ERP", status: "available" },
  { id: "xero", name: "Xero", icon: "💷", category: "ERP", status: "available" },
  { id: "sage", name: "Sage", icon: "🧮", category: "ERP", status: "available" },
];

function CRMERPPortal() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | "CRM" | "ERP" | "CRM+ERP">("all");
  const [connecting, setConnecting] = useState<string | null>(null);

  const filtered = crmProviders.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === "all" || p.category === category || (category === "CRM" && p.category === "CRM+ERP") || (category === "ERP" && p.category === "CRM+ERP");
    return matchesSearch && matchesCat;
  });

  const handleConnect = async (providerId: string) => {
    setConnecting(providerId);
    // Simulate OAuth flow
    await new Promise(r => setTimeout(r, 1500));
    setConnecting(null);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">CRM & ERP Connections</h1>
        <p className="text-stone-400 mt-1">Connect your customer and enterprise resource planning systems for AI-powered automation.</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "CRM Providers", value: "6", color: "text-blue-400" },
          { label: "ERP Providers", value: "6", color: "text-emerald-400" },
          { label: "Connected", value: "0", color: "text-white" },
          { label: "Actions Available", value: "54+", color: "text-amber-400" },
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
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-500">
          <div className="text-4xl mb-4">🔌</div>
          <p className="font-bold">No providers found</p>
          <p className="text-sm mt-1">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(provider => (
            <div
              key={provider.id}
              className="bg-stone-900 border border-stone-800 rounded-2xl p-6 hover:border-stone-700 transition-all group"
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
                    }`}>
                      {provider.category}
                    </span>
                  </div>
                </div>
                <div className="w-2 h-2 rounded-full bg-stone-600 group-hover:bg-emerald-500 transition-colors" title="Available" />
              </div>
              <button
                onClick={() => handleConnect(provider.id)}
                disabled={connecting === provider.id}
                className="w-full py-2.5 rounded-xl bg-stone-800 text-stone-300 font-bold text-sm hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-50"
              >
                {connecting === provider.id ? "Connecting..." : "Connect"}
              </button>
            </div>
          ))}
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
