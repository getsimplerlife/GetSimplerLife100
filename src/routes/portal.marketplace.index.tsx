import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { getSetupBadge } from "~/agents/setupRequirements";
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
  deployedCount?: number;
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


function MarketplaceHub() {
  const [activeTab, setActiveTab] = useState<"catalog" | "history">("catalog");

  const [items, setItems] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Simple Stripe checkout — redirect to payment link, no simulation
  const [checkoutItem, setCheckoutItem] = useState<MarketplaceItem | null>(null);

  const categories = ["all", "Healthcare", "Finance", "Sales", "Operations", "HR", "Logistics", "IT", "Marketing"];

  // Core Sync Function
  const loadData = async () => {
    try {
      const [empRes, billingRes, mktRes] = await Promise.all([
        fetch("/api/data/employees", { credentials: "include" }),
        fetch("/api/data/billing", { credentials: "include" }),
        fetch("/api/data/marketplace", { credentials: "include" }),
      ]);

      const empData = await empRes.json();
      const emps = empData.data || [];
      setEmployees(emps);

      const billData = await billingRes.json();
      setInvoices(billData.data || []);

      let marketplaceItemsList: any[] = [];
      if (mktRes.ok) {
        const mktData = await mktRes.json();
        if (mktData.data && Array.isArray(mktData.data)) {
          marketplaceItemsList = mktData.data;
        } else if (Array.isArray(mktData)) {
          marketplaceItemsList = mktData;
        }
      }

      // Map deployed counts, installed flags, and payment links from employee catalog
      const mapped = marketplaceItemsList.map((item) => {
        const deployedInstances = emps.filter(
          (emp: any) => emp.agentType === item.agentType || emp.type === item.agentType
        );
        // Find matching employee in catalog to get real paymentLink
        const catalogMatch = emps.find(
          (emp: any) => emp.agentType === item.agentType || emp.name === item.name
        );
        return {
          ...item,
          deployedCount: deployedInstances.length,
          installed: deployedInstances.length > 0,
          paymentLink: catalogMatch?.paymentLink || item.paymentLink,
          chainsWith: item.agentType ? getAgentChainPartners(item.agentType) : [],
        };
      });

      // Prepend CRM and ERP Connection Packs to marketplace items
      const crmPack: MarketplaceItem = {
        id: "crm-connection-pack",
        name: "CRM Connection Pack",
        description: "Unlock 1 connection slot for CRM platforms. Connect Salesforce, HubSpot, Zoho, Pipedrive, and more. Each slot supports one provider connection. Purchase again to add more slots.",
        category: "Operations",
        price: "$2,500",
        installed: false,
        deployedCount: 0,
        rating: 4.9,
        runsMonth: "unlimited",
        icon: "💼",
        paymentLink: "https://buy.stripe.com/test_crm_pack_5slots",
        setupRequirements: null,
        badges: ["1 CRM Slot", "Works Out of Box", "Slack Integration"],
        chainsWith: ["CRM Sync Agent", "Lead Scoring Agent", "Sales Follow-Up Agent"],
        agentType: "crm-pack",
      };

      const erpPack: MarketplaceItem = {
        id: "erp-connection-pack",
        name: "ERP Connection Pack",
        description: "Unlock 1 connection slot for ERP and accounting platforms. Connect NetSuite, QuickBooks, SAP, Xero, Sage Intacct, and more. Each slot supports one provider connection. Purchase again to add more slots.",
        category: "Operations",
        price: "$2,500",
        installed: false,
        deployedCount: 0,
        rating: 4.9,
        runsMonth: "unlimited",
        icon: "🏢",
        paymentLink: "https://buy.stripe.com/test_erp_pack_5slots",
        setupRequirements: null,
        badges: ["1 ERP Slot", "Works Out of Box", "Slack Integration"],
        chainsWith: ["Invoice Processor", "PO Management Agent", "Payroll Reconciliation Agent"],
        agentType: "erp-pack",
      };

      setItems([crmPack, erpPack, ...mapped]);
      setLoading(false);
    } catch (err) {
      console.error("Marketplace fetch error:", err);
      // Fallback
      setItems([]);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Redirect to real Stripe checkout
  const initiatePurchase = (item: MarketplaceItem) => {
    if (!item.paymentLink) {
      setFeedback("Payment link not available for this item.");
      setTimeout(() => setFeedback(""), 3000);
      return;
    }
    setFeedback("Redirecting to Stripe Checkout...");
    window.open(item.paymentLink, "_blank");
    setTimeout(() => setFeedback(""), 3000);
    setCheckoutItem(null);
  };

  // Get a badge color based on text content
  const getBadgeStyle = (badge: string) => {
    const b = badge.toLowerCase();
    if (b.includes("works out of box")) return "bg-emerald-950/40 text-emerald-400 border-emerald-800/40";
    if (b.includes("crm")) return "bg-blue-950/40 text-blue-400 border-blue-800/40";
    if (b.includes("email")) return "bg-indigo-950/40 text-indigo-400 border-indigo-800/40";
    if (b.includes("erp") || b.includes("accounting")) return "bg-amber-950/40 text-amber-400 border-amber-800/40";
    if (b.includes("documents")) return "bg-purple-950/40 text-purple-400 border-purple-800/40";
    if (b.includes("twilio")) return "bg-cyan-950/40 text-cyan-400 border-cyan-800/40";
    if (b.includes("social")) return "bg-pink-950/40 text-pink-400 border-pink-800/40";
    if (b.includes("monitoring") || b.includes("communication")) return "bg-violet-950/40 text-violet-400 border-violet-800/40";
    if (b.includes("ticketing")) return "bg-orange-950/40 text-orange-400 border-orange-800/40";
    return "bg-stone-900 text-stone-400 border-stone-800";
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
      <div className="flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-12 h-12 border-4 border-stone-900 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-stone-400 text-xs font-mono tracking-widest uppercase">Syncing Marketplace Engine...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto p-4 md:p-6 text-stone-100 font-sans">
      
      {/* Premium Header */}
      <div className="border-b border-stone-900 pb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <span className="text-emerald-500">🛍️</span> AI Employees Marketplace
          </h1>
          <p className="text-stone-400 text-xs mt-1 max-w-2xl">
            Browse, purchase, and deploy autonomous, industry-specific digital coworkers. Allow multiple instances of specialized agents to run concurrently.
          </p>
        </div>

        {/* Tab Controls to toggle Store vs History */}
        <div className="flex bg-stone-950 p-1 border border-stone-900 rounded-xl font-mono text-[10px] font-bold uppercase tracking-wider shrink-0">
          <button
            onClick={() => setActiveTab("catalog")}
            className={`px-4 py-2 rounded-lg transition-all ${
              activeTab === "catalog" ? "bg-emerald-600 text-white" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            🏪 AI Catalog
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === "history" ? "bg-emerald-600 text-white" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            📜 Purchase History ({invoices.length})
          </button>
        </div>
      </div>

      {/* ─── SECTION 1: store catalog ─── */}
      {activeTab === "catalog" && (
        <div className="space-y-6">
          {/* Search and Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-stone-950 p-3 border border-stone-900 rounded-xl flex items-center">
              <span className="text-stone-600 text-xs mr-3">🔍</span>
              <input
                type="text"
                placeholder="Search pre-trained AI Employees by keywords, department, or capability..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 bg-transparent border-0 text-xs outline-none font-semibold placeholder-stone-600 text-stone-200"
              />
            </div>

            <select
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="bg-stone-950 border border-stone-900 rounded-xl px-4 py-3 text-xs outline-none font-bold text-stone-400 cursor-pointer"
            >
              <option value="all">📁 All Division Categories</option>
              <option value="Healthcare">🏥 Healthcare</option>
              <option value="Finance">💸 Finance</option>
              <option value="Sales">📈 Sales</option>
              <option value="Operations">⚙️ Operations</option>
              <option value="HR">👤 Human Resources</option>
              <option value="Logistics">📦 Logistics</option>
              <option value="IT">🖥️ IT & Infrastructure</option>
              <option value="Marketing">📱 Marketing & Social</option>
            </select>
          </div>

          {/* AI Employees Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fadeIn">
            {filteredItems.length === 0 ? (
              <div className="col-span-full text-center py-16 border-2 border-dashed border-stone-900 rounded-3xl space-y-4 max-w-lg mx-auto">
                <span className="text-4xl block opacity-40">🛒</span>
                <div className="space-y-1">
                  <div className="font-bold text-white text-sm">No Digital Coworkers Match Search</div>
                  <p className="text-xs text-stone-500">Try adjusting your filters or keyword query to discover matching agent models.</p>
                </div>
              </div>
            ) : (
              filteredItems.map((itm) => (
                <div
                  key={itm.id}
                  className="bg-stone-950 border border-stone-900 hover:border-stone-850/80 rounded-3xl p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-xl hover:shadow-black/20"
                >
                  <div className="space-y-4">
                    {/* Header: Icon, Deployed count, Category */}
                    <div className="flex justify-between items-start">
                      <div className="h-12 w-12 bg-stone-900 border border-stone-800 rounded-2xl flex items-center justify-center text-2xl shadow-inner shadow-black/40">
                        {itm.icon}
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-[9px] font-mono font-black text-stone-400 uppercase tracking-widest bg-stone-900/60 border border-stone-850 px-2 py-0.5 rounded-md">
                          {itm.category}
                        </span>
                        {(itm.deployedCount || 0) > 0 && (
                          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            {itm.deployedCount} active
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Badge Requirements */}
                    {itm.badges && itm.badges.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {itm.badges.map((badge, bi) => (
                          <span
                            key={bi}
                            className={`px-2.5 py-0.5 rounded-md text-[9px] font-mono font-bold border ${getBadgeStyle(badge)}`}
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Chain Partnerships */}
                    {itm.chainsWith && itm.chainsWith.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[8px] font-mono uppercase tracking-wider text-stone-600 block">Collaborative Chains:</span>
                        <div className="flex flex-wrap gap-1">
                          {itm.chainsWith.slice(0, 3).map((partner, ci) => (
                            <span key={ci} className="text-[8px] font-bold bg-stone-900/80 text-stone-400 border border-stone-850 px-1.5 py-0.5 rounded-md">
                              🤝 {partner}
                            </span>
                          ))}
                          {itm.chainsWith.length > 3 && (
                            <span className="text-[8px] font-semibold text-stone-600">+{itm.chainsWith.length - 3} more</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Desc */}
                    <div className="space-y-1.5">
                      <h3 className="text-sm font-black text-white">{itm.name}</h3>
                      <p className="text-stone-400 text-xs leading-relaxed font-semibold line-clamp-3 min-h-[54px]">
                        {itm.description}
                      </p>
                    </div>

                    {/* Task Rating Details */}
                    <div className="flex gap-4 text-[10px] font-mono text-stone-500 border-t border-stone-900/80 pt-3">
                      <div>EFFICACY: <span className="text-stone-300 font-bold">★ {itm.rating}</span></div>
                      <div>TASKS: <span className="text-stone-300 font-bold">{itm.runsMonth}/mo</span></div>
                    </div>
                  </div>

                  {/* Order Footer Button */}
                  <div className="border-t border-stone-900/80 pt-4 mt-5 flex justify-between items-center">
                    <div>
                      <span className="text-[8px] font-mono uppercase text-stone-500 block">Subscription SLA</span>
                      <span className="text-xs font-bold text-white font-mono">{itm.price}</span>
                    </div>

                    <button
                      onClick={() => initiatePurchase(itm)}
                      className="text-[10px] font-mono font-black tracking-wide uppercase px-4.5 py-2.5 rounded-xl border bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-500 hover:border-emerald-500 transition-all cursor-pointer shadow-lg active:scale-95 flex items-center gap-1.5"
                    >
                      Deploy {(itm.deployedCount || 0) > 0 ? "Another" : "Employee"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ─── SECTION 2: PURCHASE HISTORY ─── */}
      {activeTab === "history" && (
        <div className="bg-stone-950 border border-stone-900 rounded-[2rem] p-6 md:p-8 space-y-6 animate-fadeIn">
          <div>
            <h3 className="text-xl font-black text-white">License Purchase & Order Ledger</h3>
            <p className="text-xs text-stone-500">Review all purchases and active payment records.</p>
          </div>

          {invoices.length > 0 ? (
            <div className="overflow-hidden border border-stone-900 rounded-2xl">
              <table className="w-full text-left text-xs font-semibold">
                <thead>
                  <tr className="bg-stone-900 text-stone-400 border-b border-stone-900 uppercase tracking-wider text-[10px]">
                    <th className="p-4">Transaction / Receipt ID</th>
                    <th className="p-4">Purchased Product Module</th>
                    <th className="p-4">Billed Amount</th>
                    <th className="p-4">Activation Date</th>
                    <th className="p-4 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-900 font-semibold text-stone-300">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-stone-900/20 transition-colors">
                      <td className="p-4 font-mono text-[10px] text-stone-400">{inv.id}</td>
                      <td className="p-4 font-black text-white">{inv.type || inv.productName}</td>
                      <td className="p-4 font-black text-emerald-400">{inv.amount}</td>
                      <td className="p-4 text-stone-500 font-medium">{inv.date}</td>
                      <td className="p-4 text-right">
                        <span className="text-[9px] bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Active</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 border border-dashed border-stone-900 rounded-3xl space-y-4 max-w-xl mx-auto">
              <span className="text-4xl">📜</span>
              <div className="space-y-1">
                <div className="font-bold text-white text-sm">No Purchases Logged Yet</div>
                <p className="text-xs text-stone-500 max-w-sm mx-auto">Deploy digital employees from the AI Catalog above to populate your official workspace purchase license ledger.</p>
              </div>
              <button
                onClick={() => setActiveTab("catalog")}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-3 rounded-xl transition-all"
              >
                Go to AI Catalog
              </button>
            </div>
          )}
        </div>
      )}
      {/* Persistence Toast Feedback */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500/40 text-white px-5 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-400">✓</span>
          <span className="text-xs font-bold tracking-wide">{feedback}</span>
        </div>
      )}

    </div>
  );
}
