import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/marketplace/")({
  component: MarketplaceHub,
});

interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  category: "Healthcare" | "Finance" | "Sales" | "Operations" | "HR" | "Logistics";
  price: string;
  installed: boolean;
  agentId?: string; // real agent instance ID if deployed
  rating: number;
  runsMonth: string;
  icon: string;
  paymentLink?: string;
  agentType: string; // mapped to registered agent type in the runtime
}

const DEFAULT_MARKETPLACE_ITEMS: MarketplaceItem[] = [
  {
    id: "app-1",
    name: "Healthcare Intake AI",
    description: "Automates patient registrations, insurance eligibility verification, and OCR intake form ingestion. Directly connects with standard EHR systems.",
    category: "Healthcare",
    price: "$1,500/mo",
    installed: false,
    rating: 4.9,
    runsMonth: "14.2k",
    icon: "🏥",
    paymentLink: "https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07",
    agentType: "document_intake",
  },
  {
    id: "app-2",
    name: "Invoice & Ledger AI",
    description: "Orchestrates multi-currency receipt ingestion, calculates financial discrepancies, maps ledger line-items, and auto-notifies Stripe webhooks.",
    category: "Finance",
    price: "$950/mo",
    installed: false,
    rating: 4.8,
    runsMonth: "42.8k",
    icon: "💸",
    paymentLink: "https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07",
    agentType: "document_intake",
  },
  {
    id: "app-3",
    name: "Sales Outreach Coordinator AI",
    description: "Autonomous lead generation, email outbound scheduling, pre-qualification mapping, and real-time HubSpot deal creation and updating.",
    category: "Sales",
    price: "$1,200/mo",
    installed: false,
    rating: 4.7,
    runsMonth: "8.9k",
    icon: "🚀",
    paymentLink: "https://buy.stripe.com/28EcN61AGax6bAW3RX3Ru0b",
    agentType: "document_intake",
  },
  {
    id: "app-4",
    name: "Automated HR Intake & Compliance AI",
    description: "Validates onboarding document logs, processes background checks, cross-references W9 tax templates, and schedules general corporate compliance runs.",
    category: "HR",
    price: "$850/mo",
    installed: false,
    rating: 4.6,
    runsMonth: "5.1k",
    icon: "👤",
    paymentLink: "https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07",
    agentType: "document_intake",
  },
  {
    id: "app-5",
    name: "Dispatch Logistics Optimization AI",
    description: "Compares port congestion indexes, optimizes delivery schedules, dispatches container ETA deltas directly to Slack, and triggers CRM notification alerts.",
    category: "Logistics",
    price: "$1,800/mo",
    installed: false,
    rating: 4.9,
    runsMonth: "25.4k",
    icon: "📦",
    paymentLink: "https://buy.stripe.com/8x26oIensbBa0Wi4W13Ru07",
    agentType: "document_intake",
  },
  {
    id: "app-6",
    name: "Operations Audit Logger AI",
    description: "Aggregates background logs, calculates labor savings indicators, generates executive-facing analytics summaries, and maps operational anomalies.",
    category: "Operations",
    price: "$750/mo",
    installed: false,
    rating: 4.8,
    runsMonth: "19.3k",
    icon: "⚙️",
    paymentLink: "https://buy.stripe.com/28E4gAens20AfRcbkp3Ru04",
    agentType: "document_intake",
  },
];

// Map marketplace item ID → agent type for deploy API calls
const ITEM_TO_AGENT_TYPE: Record<string, string> = {
  "app-1": "document_intake",
  "app-2": "document_intake",
  "app-3": "document_intake",
  "app-4": "document_intake",
  "app-5": "document_intake",
  "app-6": "document_intake",
};

function MarketplaceHub() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = ["all", "Healthcare", "Finance", "Sales", "Operations", "HR", "Logistics"];

  // Fetch marketplace items + deployed agents on load
  useEffect(() => {
    (async () => {
      try {
        // Load marketplace data from database
        const res = await fetch("/api/data/marketplace", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const d = await res.json();

        let loadedItems: MarketplaceItem[] = [];
        if (d.data && d.data.length > 0) {
          const firstRow = d.data[0];
          if (firstRow && Array.isArray(firstRow.data)) {
            loadedItems = firstRow.data;
          } else {
            loadedItems = d.data;
          }
        }

        if (loadedItems.length === 0) {
          // Seed defaults: merge with agentType field
          loadedItems = DEFAULT_MARKETPLACE_ITEMS;
          await fetch("/api/data/marketplace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ data: DEFAULT_MARKETPLACE_ITEMS }),
          });
        }

        // Fetch real deployed agents from the agent runtime
        const agentRes = await fetch("/api/agents/list", { credentials: "include" });
        let deployedAgentIds = new Set<string>();
        let deployedAgentMap = new Map<string, string>();
        if (agentRes.ok) {
          const agentData = await agentRes.json();
          if (agentData.success && agentData.agents) {
            // Match deployed agents against marketplace items by name
            for (const agent of agentData.agents) {
              // Check if any marketplace item matches this agent's name
              const matchItem = loadedItems.find(
                (itm: MarketplaceItem) =>
                  itm.name.toLowerCase() === (agent.name || "").toLowerCase() ||
                  itm.name.toLowerCase().includes((agent.name || "").toLowerCase()) ||
                  (agent.name || "").toLowerCase().includes(itm.name.toLowerCase())
              );
              if (matchItem) {
                deployedAgentIds.add(matchItem.id);
                deployedAgentMap.set(matchItem.id, agent.id);
              }
            }
          }
        }

        // Mark items as installed if they have a matching deployed agent
        loadedItems = loadedItems.map((itm: MarketplaceItem) => ({
          ...itm,
          installed: deployedAgentIds.has(itm.id),
          agentId: deployedAgentMap.get(itm.id) || undefined,
        }));

        setItems(loadedItems);
        setLoading(false);
      } catch (err) {
        console.error("Marketplace fetch error:", err);
        // Fallback to defaults
        setItems(DEFAULT_MARKETPLACE_ITEMS);
        setLoading(false);
      }
    })();
  }, []);

  const handleDeploy = async (item: MarketplaceItem) => {
    if (deploying) return; // prevent double-click
    setDeploying(item.id);
    try {
      setFeedback(`🚀 Deploying ${item.name}...`);

      // 1. Call the real agent runtime deploy API
      const deployRes = await fetch("/api/agents/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agentType: ITEM_TO_AGENT_TYPE[item.id] || "document_intake",
          name: item.name,
          config: { marketplaceItemId: item.id, category: item.category, source: "marketplace" },
        }),
      });

      if (!deployRes.ok) {
        const errData = await deployRes.json();
        throw new Error(errData.error || "Deploy failed");
      }

      const deployData = await deployRes.json();
      const agentId = deployData.agent?.id;

      // 2. Also save employee record so the employee directory shows it
      await fetch("/api/data/employees/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          _id: agentId,
          id: agentId,
          name: item.name,
          purpose: item.description,
          dept: item.category,
          status: "Active",
          version: "1.0.0",
          currentTask: "Awaiting instructions",
          performance: 98,
          successRate: 98,
          avgTime: "<1s",
          owner: "",
        }),
      });

      // 3. Log audit
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "marketplace_deploy",
          resource: item.id,
          details: { id: item.id, name: item.name, agentId, state: true },
        }),
      });

      // 4. Update local state
      setItems(prev =>
        prev.map(itm =>
          itm.id === item.id ? { ...itm, installed: true, agentId } : itm
        )
      );

      // 5. Save updated marketplace state to database
      const updatedItems = items.map(itm =>
        itm.id === item.id ? { ...itm, installed: true, agentId } : itm
      );
      await fetch("/api/data/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: updatedItems }),
      });

      setFeedback(`✅ ${item.name} deployed successfully!`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err: any) {
      console.error("Deploy error:", err);
      setFeedback(`❌ Failed to deploy: ${err.message}`);
      setTimeout(() => setFeedback(""), 4000);
    } finally {
      setDeploying(null);
    }
  };

  const handleUninstall = async (item: MarketplaceItem) => {
    if (deploying) return;
    setDeploying(item.id);
    try {
      setFeedback(`🔄 Uninstalling ${item.name}...`);

      // Log audit
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "marketplace_uninstall",
          resource: item.id,
          details: { id: item.id, name: item.name, state: false },
        }),
      });

      // Update local state
      setItems(prev =>
        prev.map(itm =>
          itm.id === item.id ? { ...itm, installed: false, agentId: undefined } : itm
        )
      );

      // Save marketplace state
      const updatedItems = items.map(itm =>
        itm.id === item.id ? { ...itm, installed: false, agentId: undefined } : itm
      );
      await fetch("/api/data/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: updatedItems }),
      });

      setFeedback(`✅ ${item.name} uninstalled`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err: any) {
      console.error("Uninstall error:", err);
      setFeedback(`❌ Uninstall failed: ${err.message}`);
      setTimeout(() => setFeedback(""), 4000);
    } finally {
      setDeploying(null);
    }
  };

  const filteredItems = items.filter((itm) => {
    const matchesSearch =
      itm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itm.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === "all" || itm.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Syncing Marketplace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none">

      {/* ─── Header ─── */}
      <div className="border-b border-stone-900 pb-5">
        <h1 className="text-3xl font-black text-white tracking-tight">🛍️ AI Employees Marketplace</h1>
        <p className="text-stone-400 text-xs mt-1">
          Deploy pre-trained, vertical-specific digital coworkers. Purchase or launch cognitive engines to activate them on your dashboard.
        </p>
      </div>

      {/* ─── App Store Search & Controls ─── */}
      <div className="space-y-4">
        <div className="bg-stone-950 p-3.5 border border-stone-900 rounded-xl flex items-center">
          <span className="text-stone-600 text-sm mr-3 font-mono">🔍</span>
          <input
            type="text"
            placeholder="Search pre-trained AI Employees by keywords, department, or capability..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-0 text-xs outline-none font-medium placeholder-stone-600 text-stone-200"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-mono font-bold tracking-wide uppercase transition-all ${
                activeCategory === cat
                  ? "bg-emerald-600 text-white font-black"
                  : "bg-stone-900/60 text-stone-400 hover:text-stone-200"
              }`}
            >
              {cat === "all" ? "All Divisions" : `${cat}`}
            </button>
          ))}
        </div>
      </div>

      {/* ─── App Store Grid ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-stone-950 border border-stone-900 rounded-xl space-y-2">
            <span className="text-3xl block opacity-40">🛒</span>
            <p className="text-xs font-mono text-stone-500 uppercase tracking-widest">No AI Employees matched your criteria</p>
          </div>
        ) : (
          filteredItems.map((itm) => (
            <div
              key={itm.id}
              className="bg-stone-950 border border-stone-900 hover:border-stone-850 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-lg"
            >
              <div className="space-y-4">
                {/* Logo & Category Row */}
                <div className="flex justify-between items-start">
                  <div className="h-11 w-11 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-center text-xl shadow-md">
                    {itm.icon}
                  </div>
                  <span className="text-[9px] font-mono font-bold text-stone-400 uppercase tracking-widest bg-stone-900 border border-stone-900 px-2 py-0.5 rounded-md">
                    {itm.category}
                  </span>
                </div>

                {/* Info Text */}
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white">{itm.name}</h3>
                  <p className="text-stone-400 text-xs leading-relaxed font-medium min-h-[50px] line-clamp-3">
                    {itm.description}
                  </p>
                </div>

                {/* Rating & Runs Metric Bar */}
                <div className="flex gap-4 text-[10px] font-mono text-stone-500">
                  <div>Rating: <span className="text-stone-300 font-bold">★ {itm.rating}</span></div>
                  <div>Monthly tasks: <span className="text-stone-300 font-bold">{itm.runsMonth}</span></div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="border-t border-stone-900 pt-4 mt-5 flex justify-between items-center">
                <div>
                  <span className="text-[8px] font-mono uppercase text-stone-500 block">LICENSE</span>
                  <span className="text-xs font-bold text-white font-mono">{itm.price}</span>
                </div>

                {itm.installed ? (
                  <div className="flex gap-2">
                    <Link
                      to="/portal/employees/$id"
                      params={{ id: itm.agentId || itm.id }}
                      className="text-[10px] font-mono font-black tracking-wide uppercase px-3 py-2 rounded-lg border bg-stone-800 text-emerald-400 border-stone-700 hover:text-emerald-300 transition-all cursor-pointer"
                    >
                      ▶ Manage
                    </Link>
                    <button
                      onClick={() => handleUninstall(itm)}
                      disabled={deploying === itm.id}
                      className="text-[10px] font-mono font-black tracking-wide uppercase px-3 py-2 rounded-lg border bg-stone-900 text-stone-500 border-stone-800 hover:text-red-400 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {deploying === itm.id ? "..." : "Uninstall"}
                    </button>
                  </div>
                ) : itm.paymentLink ? (
                  <button
                    onClick={() => window.open(itm.paymentLink, "_blank")}
                    className="text-[10px] font-mono font-black tracking-wide uppercase px-4 py-2 rounded-lg border bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 hover:border-emerald-500 font-black transition-all cursor-pointer shadow-lg shadow-emerald-950/20 active:scale-95"
                  >
                    Buy Now
                  </button>
                ) : (
                  <button
                    onClick={() => handleDeploy(itm)}
                    disabled={deploying === itm.id}
                    className="text-[10px] font-mono font-black tracking-wide uppercase px-4 py-2 rounded-lg border bg-white text-black border-white hover:bg-stone-100 font-black transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {deploying === itm.id ? "Deploying..." : "Deploy Employee"}
                  </button>
                )}
              </div>

            </div>
          ))
        )}
      </div>

      {/* ─── Feedback Toast Confirmation ─── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}