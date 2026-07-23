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
  const [activeTab, setActiveTab] = useState<"catalog" | "history">("catalog");
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Multi-step Checkout States
  const [checkoutItem, setCheckoutItem] = useState<MarketplaceItem | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"summary" | "processing" | "confirm" | "deploying" | "success">("summary");
  const [customName, setCustomName] = useState("");
  const [customPurpose, setCustomPurpose] = useState("");
  const [simulatedTxId, setSimulatedTxId] = useState("");
  const [simulatingLog, setSimulatingLog] = useState<string[]>([]);

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

      let marketplaceItemsList = DEFAULT_MARKETPLACE_ITEMS;
      if (mktRes.ok) {
        const mktData = await mktRes.json();
        if (mktData.data && Array.isArray(mktData.data)) {
          marketplaceItemsList = mktData.data;
        } else if (Array.isArray(mktData)) {
          marketplaceItemsList = mktData;
        }
      }

      // Map deployed counts and installed flags based on active employees database
      const mapped = marketplaceItemsList.map((item) => {
        const deployedInstances = emps.filter(
          (emp: any) => emp.agentType === item.agentType || emp.type === item.agentType
        );
        return {
          ...item,
          deployedCount: deployedInstances.length,
          installed: deployedInstances.length > 0,
          chainsWith: item.agentType ? getAgentChainPartners(item.agentType) : [],
        };
      });

      setItems(mapped);
      setLoading(false);
    } catch (err) {
      console.error("Marketplace fetch error:", err);
      // Fallback
      setItems(DEFAULT_MARKETPLACE_ITEMS.map(i => ({ ...i, deployedCount: 0, chainsWith: i.agentType ? getAgentChainPartners(i.agentType) : [] })));
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Trigger Checkout Modal
  const initiatePurchase = (item: MarketplaceItem) => {
    setCheckoutItem(item);
    setCheckoutStep("summary");
    setCustomName(`${item.name} (${(item.deployedCount || 0) + 1})`);
    setCustomPurpose(`Handles autonomous operations and workflows for ${item.category} division.`);
    setSimulatedTxId(`ch_${Math.random().toString(36).substr(2, 9).toUpperCase()}`);
    setSimulatingLog([]);
  };

  // Simulate Stripe payment flow
  const handleSimulatePayment = () => {
    setCheckoutStep("processing");
    setSimulatingLog(["Contacting Stripe Checkout gateway...", "Generating session token..."]);
    
    setTimeout(() => {
      setSimulatingLog(prev => [...prev, "Stripe security handshake complete.", "Card payment authorized successfully!"]);
      setTimeout(() => {
        setCheckoutStep("confirm");
      }, 1000);
    }, 1500);
  };

  // Deploy Employee - creates records in Database and logs purchase
  const handleConfirmDeploy = async () => {
    if (!checkoutItem) return;
    setCheckoutStep("deploying");
    setSimulatingLog(["Saving license metadata to tenant database...", "Authorizing cognitive keys..."]);

    try {
      // 1. Save new employee instance into employees collection
      const newEmployee = {
        name: customName,
        role: checkoutItem.name,
        status: "Active",
        agentType: checkoutItem.agentType,
        purpose: customPurpose,
        category: checkoutItem.category,
        icon: checkoutItem.icon,
        capabilities: [
          `Autonomous ${checkoutItem.category} triage`,
          "Multi-turn cognitive planning",
          "Cross-system integrations sync"
        ],
        createdAt: new Date().toISOString(),
      };

      await fetch("/api/data/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newEmployee),
      });

      setSimulatingLog(prev => [...prev, "Sandbox environment successfully provisioned.", "Running self-check tests..."]);

      // 2. Save purchase receipt into billing invoices history
      const newInvoice = {
        id: simulatedTxId,
        type: `${checkoutItem.name} License Subscription`,
        amount: checkoutItem.price,
        date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      };

      await fetch("/api/data/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(newInvoice),
      });

      setSimulatingLog(prev => [...prev, "SLA billing contract created.", "SendGrid onboarding dispatch triggered."]);

      // 3. Post Audit Action log
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "marketplace_purchase",
          resource: checkoutItem.id,
          details: { id: checkoutItem.id, agentType: checkoutItem.agentType, name: customName, txId: simulatedTxId },
        }),
      });

      // Map to purchaseProvisioner trigger
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "provision_purchase_simulation",
          details: { email: "tenant-owner@simplerlife100.com", productName: checkoutItem.name, amount: parseInt(checkoutItem.price.replace(/[^0-9]/g, "")) || 1000 }
        })
      }).catch(() => {});

      setTimeout(() => {
        setSimulatingLog(prev => [...prev, "✓ Cognitive Workspace Provisioned Successfully!"]);
        setTimeout(() => {
          setCheckoutStep("success");
          loadData(); // Sync states!
        }, 1000);
      }, 1500);

    } catch (err) {
      console.error("Provisioning deployment error:", err);
      setFeedback("Error: Provisioning contract timeout.");
      setCheckoutItem(null);
    }
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
            <p className="text-xs text-stone-500">Review all sandboxed simulated purchases and active live payment records.</p>
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

      {/* ─── COGNITIVE PROVISIONING CHECKOUT MODAL ─── */}
      {checkoutItem && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn font-sans">
          <div className="bg-stone-950 border border-stone-900 rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden text-stone-100 flex flex-col justify-between">
            
            {/* Modal Header */}
            <div className="p-6 md:p-8 border-b border-stone-900 flex justify-between items-center bg-stone-900/30">
              <div className="flex items-center gap-4">
                <span className="text-3xl p-3 bg-stone-900 border border-stone-850 rounded-2xl">{checkoutItem.icon}</span>
                <div>
                  <h3 className="text-lg font-black text-white">{checkoutItem.name}</h3>
                  <p className="text-xs text-stone-500">Workspace License Provisioning</p>
                </div>
              </div>
              <button
                onClick={() => setCheckoutItem(null)}
                className="p-2 hover:bg-stone-900 text-stone-500 hover:text-stone-300 rounded-xl transition-all border border-transparent hover:border-stone-800"
              >
                ✕
              </button>
            </div>

            {/* Modal Body depending on step */}
            <div className="p-6 md:p-8 space-y-6 max-h-[450px] overflow-y-auto">
              
              {/* STEP 1: SUMMARY */}
              {checkoutStep === "summary" && (
                <div className="space-y-6 animate-fadeIn">
                  <div className="space-y-2">
                    <p className="text-xs text-stone-400 leading-relaxed font-semibold">
                      Deploying this cognitive engine grants your tenant workspace an additional concurrent license. You can configure multiple instances of the same employee to handle separate workflow channels.
                    </p>
                  </div>

                  <div className="p-4 bg-stone-900/30 rounded-2xl border border-stone-900 text-xs font-semibold text-stone-400 space-y-3">
                    <div className="flex justify-between">
                      <span>Billed Product Module:</span>
                      <span className="text-white font-bold">{checkoutItem.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Instance Scope:</span>
                      <span className="text-white font-bold">Instance #{(checkoutItem.deployedCount || 0) + 1}</span>
                    </div>
                    <div className="flex justify-between border-t border-stone-900 pt-3 font-bold text-sm">
                      <span className="text-white">Billed Subscription Rate:</span>
                      <span className="text-emerald-400 font-mono font-black">{checkoutItem.price}</span>
                    </div>
                  </div>

                  {/* Double Actions Row: Stripe Live link AND Sandbox Simulator */}
                  <div className="space-y-3 pt-2">
                    <button
                      onClick={handleSimulatePayment}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs py-3.5 rounded-xl shadow-lg shadow-emerald-950/20 hover:shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                    >
                      💳 Simulate Checkout Complete (Sandboxed)
                    </button>
                    {checkoutItem.paymentLink && (
                      <a
                        href={checkoutItem.paymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full block text-center bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-300 hover:text-white font-black text-xs py-3.5 rounded-xl transition-all"
                      >
                        🔗 Go to Live Stripe Checkout
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: PROCESSING */}
              {checkoutStep === "processing" && (
                <div className="py-12 flex flex-col items-center justify-center space-y-6 animate-fadeIn">
                  <div className="w-12 h-12 border-4 border-stone-900 border-t-emerald-500 rounded-full animate-spin" />
                  <div className="text-center space-y-2 max-w-xs">
                    <div className="text-sm font-bold text-white uppercase tracking-wider font-mono">Securing Gateway Link</div>
                    <div className="space-y-1 text-[11px] font-mono text-stone-500">
                      {simulatingLog.map((log, idx) => (
                        <p key={idx} className="animate-fadeIn">❯ {log}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 3: CONFIRM & BILLING */}
              {checkoutStep === "confirm" && (
                <div className="space-y-6 animate-fadeIn text-xs font-semibold text-stone-400">
                  <div className="text-center space-y-2 pb-2">
                    <span className="text-4xl block">🎉</span>
                    <h4 className="text-base font-black text-white">Stripe Payment Confirmed!</h4>
                    <p className="text-[11px] text-stone-500 font-medium">Receipt ID: {simulatedTxId}</p>
                  </div>

                  <div className="p-4 bg-emerald-950/10 rounded-2xl border border-emerald-900/30 text-emerald-400 flex items-center gap-3">
                    <span className="text-emerald-500 text-xl">✓</span>
                    <span>License verified successfully. Configure your new coworker below to deploy.</span>
                  </div>

                  {/* Naming inputs */}
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <label className="block font-bold uppercase tracking-wider text-stone-500 text-[10px]">Digital Employee Name</label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-850 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all font-semibold"
                        placeholder="Sophia Intake AI"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block font-bold uppercase tracking-wider text-stone-500 text-[10px]">Role Purpose / Responsibility</label>
                      <textarea
                        value={customPurpose}
                        onChange={(e) => setCustomPurpose(e.target.value)}
                        rows={3}
                        className="w-full bg-stone-900 border border-stone-850 rounded-xl px-4 py-3 outline-none text-white focus:ring-2 focus:ring-emerald-500/50 transition-all font-semibold resize-none"
                        placeholder="Handles intake files and verification workflows..."
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleConfirmDeploy}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs py-3.5 rounded-xl transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 active:scale-95"
                  >
                    🚀 Initialize & Deploy Agent Instance
                  </button>
                </div>
              )}

              {/* STEP 4: DEPLOYING PROVISIONING ANIMATION */}
              {checkoutStep === "deploying" && (
                <div className="py-8 flex flex-col items-center justify-center space-y-6 animate-fadeIn">
                  <div className="w-14 h-14 border-4 border-stone-900 border-t-emerald-500 rounded-full animate-spin" />
                  <div className="text-center space-y-4 w-full max-w-sm">
                    <div className="text-sm font-black text-white uppercase tracking-wider font-mono flex items-center justify-center gap-2">
                      <span className="h-2 w-2 bg-emerald-500 rounded-full animate-ping"></span>
                      Provisioning Cognitive Workspace
                    </div>
                    <div className="p-4 bg-stone-900/50 border border-stone-900 rounded-2xl text-left font-mono text-[10px] text-stone-400 space-y-1.5 h-36 overflow-y-auto">
                      {simulatingLog.map((log, idx) => (
                        <p key={idx} className="animate-fadeIn">
                          {log.startsWith("✓") ? (
                            <span className="text-emerald-400">{log}</span>
                          ) : (
                            <span>❯ {log}</span>
                          )}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 5: SUCCESS */}
              {checkoutStep === "success" && (
                <div className="py-8 text-center space-y-6 animate-fadeIn text-xs font-semibold text-stone-400">
                  <span className="text-5xl block animate-bounce">⚡</span>
                  <div className="space-y-2">
                    <h4 className="text-xl font-black text-white">AI Employee Deployed successfully!</h4>
                    <p className="text-[11px] text-stone-500 max-w-sm mx-auto">
                      Congratulations! <strong>{customName}</strong> is now live. Its background cognitive loop is running in your sandbox and ready for triggers.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Link
                      to="/portal/employees/"
                      onClick={() => setCheckoutItem(null)}
                      className="flex-1 bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-200 font-black text-xs py-3.5 rounded-xl transition-all text-center block"
                    >
                      🤖 View in Employees directory
                    </Link>
                    <button
                      onClick={() => {
                        setCheckoutItem(null);
                        setActiveTab("history");
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs py-3.5 rounded-xl transition-all text-center"
                    >
                      📜 View Purchase History
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>
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
