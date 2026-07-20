import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AGENT_SETUP_REQUIREMENTS, getSetupBadge } from "~/agents/setupRequirements";
import { getAgentChainPartners } from "~/agents/agentChains";

export const Route = createFileRoute("/portal/marketplace/")({
  component: MarketplaceHub,
});

interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  category: "Healthcare" | "Finance" | "Sales" | "Operations" | "HR" | "Logistics" | "IT" | "Marketing";
  price: string;
  installed: boolean;
  rating: number;
  runsMonth: string;
  icon: string;
  paymentLink?: string;
  setupRequirements?: {
    type: string;
    needsConnections: string[];
    needsDataUpload: boolean;
    needsConfiguration: boolean;
    configFields: any[];
    setupSteps: any[];
    badges: string[];
    estimatedSetupMinutes: number;
  } | null;
  badges?: string[];
  chainsWith?: string[];
  agentType?: string;
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
    paymentLink: "https://buy.stripe.com/fZu3cx2Oz8k7d5Fgmk2Fa0t",
    setupRequirements: null,
    badges: ["Needs EHR", "Needs documents"],
    agentType: "healthcare_intake",
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
    paymentLink: "https://buy.stripe.com/00wfZj0Grbwj7Llda82Fa0u",
    setupRequirements: null,
    badges: ["Needs accounting", "Needs documents"],
    agentType: "invoice_ledger",
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
    paymentLink: "https://buy.stripe.com/00weVfexh57V3v5b202Fa0v",
    setupRequirements: null,
    badges: ["Needs CRM", "Needs email"],
    agentType: "sales_outreach",
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
    paymentLink: "https://buy.stripe.com/4gM7sN0GreIvghRda82Fa0w",
    setupRequirements: null,
    badges: ["Needs HR system", "Needs documents"],
    agentType: "hr_compliance",
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
    paymentLink: "https://buy.stripe.com/aFa8wR0Gr9ob7Llb202Fa0x",
    setupRequirements: null,
    badges: ["Needs communication"],
    agentType: "dispatch_logistics",
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
    paymentLink: "https://buy.stripe.com/6oUfZj4WH57V9Tt6LK2Fa0y",
    setupRequirements: null,
    badges: ["Works out of box"],
    agentType: "audit_logger",
  },
  {
    id: "app-7",
    name: "Document AI System",
    description: "Automatically processes uploaded documents: extracts text, classifies document type, extracts key information, and stores the results.",
    category: "Operations",
    price: "$499/mo",
    installed: false,
    rating: 4.9,
    runsMonth: "35.7k",
    icon: "📄",
    paymentLink: "https://buy.stripe.com/3cI4gBdtd8k7aXxc642Fa0z",
    setupRequirements: null,
    badges: ["Works out of box"],
    agentType: "document_intake",
  },
  {
    id: "app-8",
    name: "AI Customer Support Agent",
    description: "Handles incoming support tickets, classifies by urgency, generates contextual AI replies, and escalates to humans when needed.",
    category: "Operations",
    price: "$1,800/mo",
    installed: false,
    rating: 4.7,
    runsMonth: "12.1k",
    icon: "🎧",
    paymentLink: "https://buy.stripe.com/cNi00lfBldEr8Pp0nm2Fa0A",
    setupRequirements: null,
    badges: ["Needs ticketing", "Needs email"],
    agentType: "support_agent",
  },
  {
    id: "app-9",
    name: "Internal Knowledge Assistant",
    description: "Empower your workforce with immediate semantic search across full internal company wiki, document retrieval with citations, and context-aware answers.",
    category: "Operations",
    price: "$1,500/mo",
    installed: false,
    rating: 4.8,
    runsMonth: "8.5k",
    icon: "🧠",
    paymentLink: "https://buy.stripe.com/6oU3cx74P57V8Pp1rq2Fa0B",
    setupRequirements: null,
    badges: ["Needs documents"],
    agentType: "knowledge_assistant",
  },
  {
    id: "app-10",
    name: "Voice AI Receptionist",
    description: "Handles inbound phone calls via Twilio — greets callers, classifies intent, provides AI-powered responses or routes to departments.",
    category: "Operations",
    price: "$2,500/mo",
    installed: false,
    rating: 4.6,
    runsMonth: "6.3k",
    icon: "📞",
    paymentLink: "https://buy.stripe.com/5kQ14p3SDdEr8Pp4DC2Fa0C",
    setupRequirements: null,
    badges: ["Needs Twilio"],
    agentType: "voice_receptionist",
  },
  {
    id: "app-11",
    name: "Inventory Management AI",
    description: "Stock forecasting, reorder point calculation, multi-location inventory tracking, low-stock alerts, and inventory reconciliation.",
    category: "Logistics",
    price: "$1,200/mo",
    installed: false,
    rating: 4.8,
    runsMonth: "18.9k",
    icon: "📦",
    paymentLink: "https://buy.stripe.com/aFa00l2OzeIve9J3zy2Fa0D",
    setupRequirements: null,
    badges: ["Needs ERP", "Needs inventory system"],
    agentType: "inventory_management",
  },
  {
    id: "app-12",
    name: "Contract Management AI",
    description: "Contract term extraction, obligation tracking, renewal/expiry alerts, clause comparison, and version management.",
    category: "Operations",
    price: "$1,100/mo",
    installed: false,
    rating: 4.7,
    runsMonth: "9.2k",
    icon: "📋",
    paymentLink: "https://buy.stripe.com/bJeeVfcp9fMzd5Feec2Fa0E",
    setupRequirements: null,
    badges: ["Needs documents"],
    agentType: "contract_management",
  },
  {
    id: "app-13",
    name: "Customer Success AI",
    description: "Health score calculation, churn prediction signals, usage pattern analysis, upsell opportunity identification, and automated check-in scheduling.",
    category: "Sales",
    price: "$1,300/mo",
    installed: false,
    rating: 4.8,
    runsMonth: "11.4k",
    icon: "🌟",
    paymentLink: "https://buy.stripe.com/28E14p3SD1VJc1B3zy2Fa0F",
    setupRequirements: null,
    badges: ["Needs CRM", "Needs email"],
    agentType: "customer_success",
  },
  {
    id: "app-14",
    name: "Project Management AI",
    description: "Task tracking and assignment, deadline monitoring, resource allocation optimization, status report generation, and milestone tracking.",
    category: "Operations",
    price: "$1,000/mo",
    installed: false,
    rating: 4.6,
    runsMonth: "7.8k",
    icon: "📊",
    paymentLink: "https://buy.stripe.com/9B6fZj3SDgQD9Ttc642Fa0G",
    setupRequirements: null,
    badges: ["Needs PM tool"],
    agentType: "project_management",
  },
  {
    id: "app-15",
    name: "Procurement Vendor AI",
    description: "Purchase order management, vendor onboarding and qualification, vendor performance tracking, and spend analysis.",
    category: "Finance",
    price: "$1,400/mo",
    installed: false,
    rating: 4.7,
    runsMonth: "6.1k",
    icon: "🏗️",
    paymentLink: "https://buy.stripe.com/8x228t1Kv7g31mX8TS2Fa0H",
    setupRequirements: null,
    badges: ["Needs ERP", "Needs documents"],
    agentType: "procurement_vendor",
  },
  {
    id: "app-16",
    name: "IT Operations AI",
    description: "Infrastructure monitoring, incident response triage, deployment pipeline tracking, server health checks, and log analysis.",
    category: "IT",
    price: "$1,600/mo",
    installed: false,
    rating: 4.8,
    runsMonth: "22.3k",
    icon: "🖥️",
    paymentLink: "https://buy.stripe.com/3cIaEZdtd0RFfdN8TS2Fa0I",
    setupRequirements: null,
    badges: ["Needs monitoring", "Needs communication"],
    agentType: "it_operations",
  },
  {
    id: "app-17",
    name: "FP&A AI",
    description: "Budget creation and tracking, financial forecasting, variance analysis, scenario modeling, and board-ready report generation.",
    category: "Finance",
    price: "$1,500/mo",
    installed: false,
    rating: 4.9,
    runsMonth: "5.5k",
    icon: "📈",
    paymentLink: "https://buy.stripe.com/cNi14p3SDcAn5Dd5HG2Fa0J",
    setupRequirements: null,
    badges: ["Needs accounting", "Needs ERP"],
    agentType: "fp_and_a",
  },
  {
    id: "app-18",
    name: "Marketing Social AI",
    description: "Content calendar management, social media post scheduling, campaign performance tracking, and audience engagement analytics.",
    category: "Marketing",
    price: "$1,300/mo",
    installed: false,
    rating: 4.7,
    runsMonth: "15.9k",
    icon: "📱",
    paymentLink: "https://buy.stripe.com/dRm3cx3SD43R3v5c642Fa0K",
    setupRequirements: null,
    badges: ["Needs social media", "Needs CRM", "Needs email"],
    agentType: "marketing_social",
  },
];

function MarketplaceHub() {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = ["all", "Healthcare", "Finance", "Sales", "Operations", "HR", "Logistics", "IT", "Marketing"];

  useEffect(() => {
    (async () => {
      try {
        // Try to load from the new marketplace API with setup requirements
        const res = await fetch("/api/marketplace/items", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const d = await res.json();
        
        if (d.items && d.items.length > 0) {
          // Compute chainsWith for each item
          const withChains = d.items.map((item: any) => ({
            ...item,
            chainsWith: item.agentType ? getAgentChainPartners(item.agentType) : [],
          }));
          setItems(withChains);
        } else {
          // Fallback to the old data endpoint
          const oldRes = await fetch("/api/data/marketplace", { credentials: "include" });
          if (oldRes.ok) {
            const oldD = await oldRes.json();
            let loadedItems: MarketplaceItem[] = [];
            if (oldD.data && oldD.data.length > 0) {
              const firstRow = oldD.data[0];
              if (firstRow && Array.isArray(firstRow.data)) {
                loadedItems = firstRow.data;
              } else {
                loadedItems = oldD.data;
              }
            }
            if (loadedItems.length === 0) {
              loadedItems = DEFAULT_MARKETPLACE_ITEMS.map(item => ({
                ...item,
                chainsWith: item.agentType ? getAgentChainPartners(item.agentType) : [],
              }));
              // Initialize the database with defaults
              await fetch("/api/data/marketplace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ data: DEFAULT_MARKETPLACE_ITEMS }),
              });
            } else {
              loadedItems = loadedItems.map(item => ({
                ...item,
                chainsWith: item.agentType ? getAgentChainPartners(item.agentType) : [],
              }));
            }
            setItems(loadedItems);
          } else {
            setItems(DEFAULT_MARKETPLACE_ITEMS.map(item => ({
              ...item,
              chainsWith: item.agentType ? getAgentChainPartners(item.agentType) : [],
            })));
          }
        }
        setLoading(false);
      } catch (err) {
        console.error("Marketplace fetch error:", err);
        setItems(DEFAULT_MARKETPLACE_ITEMS.map(item => ({
          ...item,
          chainsWith: item.agentType ? getAgentChainPartners(item.agentType) : [],
        })));
        setLoading(false);
      }
    })();
  }, []);

  const handleAction = async (itemId: string, currentInstalled: boolean) => {
    const actionText = currentInstalled ? "Uninstall" : "Install";
    try {
      setFeedback(`${actionText}ing AI Employee from workspace...`);
      
      const updated = items.map((itm) => {
        if (itm.id === itemId) {
          return { ...itm, installed: !currentInstalled };
        }
        return itm;
      });

      setItems(updated);

      // Save changes back to database
      await fetch("/api/data/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ data: updated }),
      });

      // Audit Log Action
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "marketplace_" + actionText.toLowerCase(),
          resource: itemId,
          details: { id: itemId, state: !currentInstalled },
        }),
      });

      setFeedback(`Success: AI Employee successfully ${actionText}ed!`);
      setTimeout(() => setFeedback(""), 2500);
    } catch (err) {
      console.error(err);
      setFeedback(`Failed to ${actionText} module.`);
    }
  };

  const filteredItems = items.filter((itm) => {
    const matchesSearch =
      itm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      itm.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = activeCategory === "all" || itm.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  // Get a badge color based on text content
  const getBadgeStyle = (badge: string) => {
    if (badge.toLowerCase().includes("works out of box")) {
      return "bg-emerald-900/40 text-emerald-400 border-emerald-800/50";
    }
    if (badge.toLowerCase().includes("crm")) {
      return "bg-blue-900/40 text-blue-400 border-blue-800/50";
    }
    if (badge.toLowerCase().includes("email")) {
      return "bg-indigo-900/40 text-indigo-400 border-indigo-800/50";
    }
    if (badge.toLowerCase().includes("erp") || badge.toLowerCase().includes("accounting")) {
      return "bg-amber-900/40 text-amber-400 border-amber-800/50";
    }
    if (badge.toLowerCase().includes("documents")) {
      return "bg-purple-900/40 text-purple-400 border-purple-800/50";
    }
    if (badge.toLowerCase().includes("twilio")) {
      return "bg-cyan-900/40 text-cyan-400 border-cyan-800/50";
    }
    if (badge.toLowerCase().includes("social")) {
      return "bg-pink-900/40 text-pink-400 border-pink-800/50";
    }
    if (badge.toLowerCase().includes("monitoring") || badge.toLowerCase().includes("communication")) {
      return "bg-violet-900/40 text-violet-400 border-violet-800/50";
    }
    if (badge.toLowerCase().includes("ticketing")) {
      return "bg-orange-900/40 text-orange-400 border-orange-800/50";
    }
    return "bg-stone-800/60 text-stone-400 border-stone-700/50";
  };

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

                {/* Setup Badges */}
                {itm.badges && itm.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {itm.badges.map((badge, bi) => (
                      <span
                        key={bi}
                        className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold border ${getBadgeStyle(badge)}`}
                      >
                        {badge}
                      </span>
                    ))}
                  </div>
                )}

                {/* Chains With Badges */}
                {itm.chainsWith && itm.chainsWith.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[8px] font-mono uppercase tracking-wider text-stone-600">Chains with:</span>
                    <div className="flex flex-wrap gap-1">
                      {itm.chainsWith.slice(0, 3).map((partner, ci) => (
                        <span key={ci} className="text-[8px] font-mono font-bold bg-stone-900 text-stone-400 border border-stone-800 px-1.5 py-0.5 rounded-md">
                          {partner}
                        </span>
                      ))}
                      {itm.chainsWith.length > 3 && (
                        <span className="text-[8px] font-mono text-stone-600">+{itm.chainsWith.length - 3} more</span>
                      )}
                    </div>
                  </div>
                )}

                {/* Info Text */}
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white">{itm.name}</h3>
                  <p className="text-stone-400 text-xs leading-relaxed font-medium min-h-[50px] line-clamp-3">
                    {itm.description}
                  </p>
                </div>

                {/* Setup Time Badge */}
                {itm.setupRequirements?.estimatedSetupMinutes && (
                  <div className="text-[9px] font-mono text-stone-500 flex items-center gap-1">
                    <span>⏱️</span>
                    <span>~{itm.setupRequirements.estimatedSetupMinutes} min setup</span>
                  </div>
                )}

                {/* Rating & Runs Metric Bar */}
                <div className="flex gap-4 text-[10px] font-mono text-stone-500">
                  <div>Rating: <span className="text-stone-300 font-bold">★ {itm.rating}</span></div>
                  <div>Monthly tasks: <span className="text-stone-300 font-bold">{itm.runsMonth}</span></div>
                </div>
              </div>

              {/* Install / Uninstall Button Actions Row */}
              <div className="border-t border-stone-900 pt-4 mt-5 flex justify-between items-center">
                <div>
                  <span className="text-[8px] font-mono uppercase text-stone-500 block">LICENSE</span>
                  <span className="text-xs font-bold text-white font-mono">{itm.price}</span>
                </div>

                {itm.installed ? (
                  <button
                    onClick={() => handleAction(itm.id, itm.installed)}
                    className="text-[10px] font-mono font-black tracking-wide uppercase px-4 py-2 rounded-lg border bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-200 transition-all cursor-pointer"
                  >
                    ✓ Deployed
                  </button>
                ) : itm.paymentLink ? (
                  <button
                    onClick={() => window.open(itm.paymentLink, "_blank")}
                    className="text-[10px] font-mono font-black tracking-wide uppercase px-4 py-2 rounded-lg border bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 hover:border-emerald-500 font-black transition-all cursor-pointer shadow-lg shadow-emerald-950/20 active:scale-95"
                  >
                    Buy Now
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction(itm.id, itm.installed)}
                    className="text-[10px] font-mono font-black tracking-wide uppercase px-4 py-2 rounded-lg border bg-white text-black border-white hover:bg-stone-100 font-black transition-all cursor-pointer active:scale-95"
                  >
                    Deploy Employee
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