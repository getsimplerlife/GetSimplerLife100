import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { 
  Button, 
  Card, 
  CardHeader, 
  CardBody, 
  Badge, 
  Input, 
  Modal, 
  Sidebar 
} from "~/components/ui";

const addOns = [
  { name: "Additional AI Agent", price: "$1,500" },
  { name: "CRM Integration", price: "$2,000" },
  { name: "ERP Integration", price: "$3,500" },
  { name: "Voice AI Receptionist", price: "$3,000" },
  { name: "AI Sales Assistant", price: "$4,000" },
  { name: "AI Customer Support Agent", price: "$4,000" },
  { name: "Custom Dashboard", price: "$2,500" },
  { name: "Document AI System", price: "$3,500" },
  { name: "Employee Training", price: "$1,500" },
  { name: "Additional Dept. Automation", price: "$5,000" },
];

export const Route = createFileRoute("/portal/")({
  component: Portal,
});

// Mock data for expanded sections
const mockTimeline = [
  { id: 1, agent: "Energy Analyst", action: "Extracted dispatch payload", status: "success", detail: "PDF: carrier_dispatch_892.pdf", time: "10 mins ago" },
  { id: 2, agent: "Finance Copilot", action: "Reconciled AP invoice", status: "success", detail: "QuickBooks Sync: Invoice #10299", time: "1 hour ago" },
  { id: 3, agent: "Healthcare Intake", action: "Handwriting OCR Form Extraction", status: "human_review", detail: "Form: patient_registration.png (Needs sign check)", time: "3 hours ago" },
  { id: 4, agent: "Logistics Dispatcher", action: "Dispatched carrier notification", status: "success", detail: "SMS Notification sent to +1 (555) 0192", time: "5 hours ago" },
];

const mockTickets = [
  { id: "T-402", subject: "Configure Salesforce webhook routing", status: "open", priority: "high", category: "Integrations", date: "2026-07-01" },
  { id: "T-398", subject: "PDF table parsing error on column alignment", status: "resolved", priority: "medium", category: "Document AI", date: "2026-06-28" },
  { id: "T-381", subject: "Model responsiveness tweak for prompt system", status: "resolved", priority: "low", category: "Agent Behavior", date: "2026-06-25" },
];

const mockKnowledgeBase = [
  { id: 1, category: "Getting Started", title: "Uploading Business Files to Deployed AI Coworkers", excerpt: "Learn how to format and upload CSV, Excel, or PDF files so your AI agents can process them instantly." },
  { id: 2, category: "Integrations", title: "Setting up Salesforce OAuth & Webhooks", excerpt: "Step-by-step credentials walkthrough for connecting your AI coworker to your central CRM hub safely." },
  { id: 3, category: "Document AI", title: "Best Practices for Scanned Handwriting OCR", excerpt: "Optimize your handwriting OCR conversion accuracy using clean scans, pattern-matching, and chromatic ink verification." },
  { id: 4, category: "Billing", title: "Understanding Managed Operations Tiers", excerpt: "How bug-fixes, model updates, and prompt customizations are covered under your monthly Essential or Professional plan." },
];

const mockTeamMembers = [
  { name: "You", email: "user@example.com", role: "Owner", status: "Active" },
  { name: "Sarah Connor", email: "sarah@example.com", role: "Admin", status: "Active" },
  { name: "John Doe", email: "john@example.com", role: "Viewer", status: "Pending" },
];

const mockInvoices = [
  { id: "INV-2026-004", date: "Jul 1, 2026", amount: "$750.00", plan: "Essential Ops", status: "Paid" },
  { id: "INV-2026-003", date: "Jun 1, 2026", amount: "$750.00", plan: "Essential Ops", status: "Paid" },
  { id: "INV-2026-002", date: "May 1, 2026", amount: "$2,500.00", plan: "Deep-Dive Audit", status: "Paid" },
];

function Portal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [audits, setAudits] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("dashboard");

  // Expanded Portal States
  const [tickets, setTickets] = useState(mockTickets);
  const [kbSearch, setMockKbSearch] = useState("");
  const [newTicketModal, setNewTicketModal] = useState(false);
  const [newTicketSubject, setNewTicketSubject] = useState("");
  const [newTicketDesc, setNewTicketDesc] = useState("");
  const [newTicketPriority, setNewTicketPriority] = useState("medium");
  const [newTicketCategory, setNewTicketCategory] = useState("Integrations");

  // Workflow Builder States
  const [builderSteps, setBuilderSteps] = useState<any[]>([
    { id: 1, type: "trigger", name: "Inbound Carrier Email Receive", desc: "Monitors office inbox for carrier dispatch quotes" },
    { id: 2, type: "action", name: "Document Table AI Extraction", desc: "Scans attachment table and parses rate & equipment" },
    { id: 3, type: "action", name: "TMS Database Verification", desc: "Cross-checks carrier rates with database benchmark rules" },
    { id: 4, type: "action", name: "Auto-generate Booking Confirmation", desc: "Generates offer letter PDF with signature check" },
  ]);
  const [selectedBuilderStep, setSelectedBuilderStep] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me");
        if (!meRes.ok) { navigate({ to: "/login" as any }); return; }
        const me = await meRes.json();
        setUser(me);
        
        const [auditsRes, agentsRes] = await Promise.all([
          fetch("/api/audits"),
          fetch("/api/agents"),
        ]);
        if (auditsRes.ok) setAudits(await auditsRes.json());
        if (agentsRes.ok) setAgents(await agentsRes.json());
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    navigate({ to: "/" });
  };

  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicketSubject.trim()) return;
    const newT = {
      id: `T-${Math.floor(400 + Math.random() * 100)}`,
      subject: newTicketSubject,
      status: "open",
      priority: newTicketPriority,
      category: newTicketCategory,
      date: new Date().toISOString().split("T")[0]
    };
    setTickets([newT, ...tickets]);
    setNewTicketSubject("");
    setNewTicketDesc("");
    setNewTicketModal(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🔄</div>
          <p className="text-slate-600 dark:text-slate-400 font-bold">Loading your portal dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const totalRuns = agents.reduce((acc, a) => acc + (a.runCount || 0), 0);
  const totalSavings = agents.reduce((acc, a) => acc + (a.savings || 0), 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex">
      {/* Sidebar Navigation */}
      <Sidebar userEmail={user.email} onLogout={handleLogout}>
        <div className="text-xs font-black uppercase text-slate-400 tracking-wider px-4 mb-4">Operations Client</div>
        
        <button 
          onClick={() => setActiveTab("dashboard")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "dashboard" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span>📊</span> Overview Dashboard
        </button>

        <button 
          onClick={() => setActiveTab("agents")}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "agents" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span className="flex items-center gap-3">
            <span>🤖</span> My AI Agents
          </span>
          {agents.length > 0 && (
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${activeTab === "agents" ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-700"}`}>
              {agents.length}
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab("audits")}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "audits" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span className="flex items-center gap-3">
            <span>🔍</span> Efficiency Audits
          </span>
          {audits.length > 0 && (
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${activeTab === "audits" ? "bg-white/20 text-white" : "bg-indigo-50 text-indigo-700"}`}>
              {audits.length}
            </span>
          )}
        </button>

        <button 
          onClick={() => setActiveTab("builder")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "builder" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span>⚙️</span> Workflow Builder
        </button>

        <div className="pt-6 my-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-xs font-black uppercase text-slate-400 tracking-wider px-4 mb-4">Support & Team</div>
        </div>

        <button 
          onClick={() => setActiveTab("tickets")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "tickets" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span>💬</span> Support Desk
        </button>

        <button 
          onClick={() => setActiveTab("knowledge")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "knowledge" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span>📚</span> Knowledge Base
        </button>

        <button 
          onClick={() => setActiveTab("billing")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "billing" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span>🧾</span> Billing & Plans
        </button>

        <button 
          onClick={() => setActiveTab("team")}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all text-left ${
            activeTab === "team" ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <span>👥</span> User Management
        </button>

        {/* Link to Admin Portal for Devs / Demo */}
        <div className="pt-6 my-4 border-t border-slate-100 dark:border-slate-800">
          <Link 
            to="/portal/admin"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-black text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-all"
          >
            <span>👑</span> Go to Admin Portal
          </Link>
        </div>
      </Sidebar>

      {/* Main Content Area */}
      <main className="flex-1 min-h-screen ml-64 p-8 lg:p-12 overflow-y-auto">
        
        {/* =========================================================
            1. DASHBOARD OVERVIEW TAB
            ========================================================= */}
        {activeTab === "dashboard" && (
          <div className="space-y-10 animate-in fade-in duration-200">
            {/* Header banner */}
            <div className="bg-gradient-to-r from-indigo-900 to-indigo-700 rounded-[2.5rem] p-8 lg:p-12 text-white shadow-xl shadow-indigo-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -mr-20 -mt-20 pointer-events-none" />
              <div className="relative z-10 max-w-2xl">
                <h1 className="text-3xl lg:text-4xl font-black mb-3">Welcome back, {user.email.split("@")[0]}!</h1>
                <p className="text-indigo-100 text-lg leading-relaxed">
                  Your AI coworkers are running 24/7. Your automation infrastructure is healthy and performing at peak efficiency.
                </p>
              </div>
            </div>

            {/* Metrics cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="p-6">
                <div className="text-3xl mb-3">🤖</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">{agents.length || 0}</div>
                <div className="text-sm font-bold text-slate-500 mt-1">Active AI Coworkers</div>
              </Card>
              <Card className="p-6">
                <div className="text-3xl mb-3">⚙️</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">{totalRuns || 142}</div>
                <div className="text-sm font-bold text-slate-500 mt-1">Automated Executed Runs</div>
              </Card>
              <Card className="p-6">
                <div className="text-3xl mb-3">💰</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">${(totalSavings || 24500).toLocaleString()}/yr</div>
                <div className="text-sm font-bold text-slate-500 mt-1">Estimated ROI Reclaimed</div>
              </Card>
              <Card className="p-6">
                <div className="text-3xl mb-3">📈</div>
                <div className="text-3xl font-black text-slate-900 dark:text-white">99.7%</div>
                <div className="text-sm font-bold text-slate-500 mt-1">Successful Run Ratio</div>
              </Card>
            </div>

            {/* Main content grid split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Timeline feed */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white">Recent AI Activity</h2>
                  <Button size="sm" variant="outline" onClick={() => setActiveTab("agents")}>View Running Logs</Button>
                </div>
                <Card className="divide-y divide-slate-50 dark:divide-slate-800">
                  {mockTimeline.map((item) => (
                    <div key={item.id} className="p-6 flex items-start gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-lg shrink-0">
                        ⚙️
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">{item.agent}</span>
                          <span className="text-xs text-slate-400 font-medium">{item.time}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 font-semibold mt-1">{item.action}</p>
                        <p className="text-xs text-slate-400 font-medium mt-0.5">{item.detail}</p>
                      </div>
                      <Badge variant={item.status === "success" ? "success" : "warning"}>
                        {item.status}
                      </Badge>
                    </div>
                  ))}
                </Card>
              </div>

              {/* Support overview card widget */}
              <div className="space-y-6">
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Active Tickets</h2>
                <Card className="p-6 flex flex-col justify-between h-fit gap-6">
                  <div className="space-y-4">
                    {tickets.slice(0, 2).map((t) => (
                      <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                        <div className="truncate flex-1 pr-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm block truncate">{t.subject}</span>
                          <span className="text-xs text-slate-400 font-medium">{t.id} • {t.category}</span>
                        </div>
                        <Badge variant={t.priority === "high" ? "danger" : "warning"}>{t.priority}</Badge>
                      </div>
                    ))}
                    {tickets.length === 0 && <p className="text-sm text-slate-500 italic text-center py-4">No open tickets</p>}
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => setActiveTab("tickets")}>
                    Go to Support Desk
                  </Button>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            2. MY AI AGENTS TAB (DASHBOARD REDIRECT WITH EMBEDDED PREVIEW)
            ========================================================= */}
        {activeTab === "agents" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">My AI Coworkers</h1>
                <p className="text-slate-500 mt-1">Configure and manage your production-ready deployed AI coworkers.</p>
              </div>
              <Link 
                to="/portal/agents" 
                className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100 flex items-center gap-2"
              >
                🤖 Open Specialized Agent Control Panel →
              </Link>
            </div>

            {agents.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="text-5xl mb-4">🤖</div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No agents deployed yet</h3>
                <p className="text-slate-500 max-w-sm mx-auto mb-6">
                  Complete your Deep-Dive Efficiency Audit. Deployed agents appear here automatically once configured.
                </p>
                <Button onClick={() => setActiveTab("audits")}>Browse Active Audits</Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {agents.map((agent) => (
                  <Card key={agent.id} className="overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-slate-50 to-indigo-50/20 flex justify-between items-center">
                      <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white">{agent.name}</h3>
                        <p className="text-xs text-slate-400 font-bold uppercase mt-1">ID: {agent.id.slice(0, 8)}...</p>
                      </div>
                      <Badge variant="success">Active</Badge>
                    </CardHeader>
                    <CardBody className="space-y-6">
                      <div>
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Active Workflows</h4>
                        <div className="space-y-1.5">
                          {agent.workflows?.map((wf: string) => (
                            <div key={wf} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                              <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{wf}</span>
                              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-bold">Configured ✓</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-4 justify-between border-t border-slate-100 dark:border-slate-800 pt-4 text-sm text-slate-500 font-semibold">
                        <span>💰 Est. Savings: ${agent.savings?.toLocaleString()}/yr</span>
                        <span>Runs: {agent.runCount || 0}</span>
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            3. AUDITS & BLUEPRINTS TAB (THE ORIGINAL VIEWS, EXPANDED & POLISHED)
            ========================================================= */}
        {activeTab === "audits" && (
          <div className="space-y-10 animate-in fade-in duration-200">
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">Efficiency Audits</h1>
              <p className="text-slate-500 mt-1">Track the creation process of your digital blueprint mapping.</p>
            </div>

            {audits.length === 0 ? (
              <Card className="p-12 text-center">
                <div className="text-5xl mb-4">🔍</div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No audits found</h3>
                <p className="text-slate-500 max-w-sm mx-auto mb-6">
                  You haven't ordered a Deep-Dive Efficiency Audit yet. Order one to build your technical agent roadmap.
                </p>
                <a href="/#pricing" className="inline-flex justify-center items-center px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black">
                  Browse Audit Tiers
                </a>
              </Card>
            ) : (
              <div className="grid gap-6">
                {audits.map((audit) => (
                  <Card key={audit.id} className="p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="font-black text-lg text-slate-900 dark:text-white">{audit.type}</span>
                        <Badge variant={
                          audit.status === "completed" ? "success" : 
                          audit.status === "implemented" ? "indigo" : 
                          audit.status === "in-progress" ? "blue" : "slate"
                        }>
                          {audit.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                        Audit ID: {audit.id} • Started {new Date(audit.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Link
                      to="/portal/$auditId"
                      params={{ auditId: audit.id }}
                      className="px-5 py-2.5 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-600 rounded-xl font-bold transition-all text-sm whitespace-nowrap"
                    >
                      View Report →
                    </Link>
                  </Card>
                ))}
              </div>
            )}

            {/* Add-ons List */}
            <div className="space-y-6 pt-10 border-t border-slate-100 dark:border-slate-800">
              <div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Request Add-on Capabilities</h2>
                <p className="text-slate-500 mt-1">Scale up your existing workforce integrations instantly.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {addOns.map((item) => (
                  <Link
                    key={item.name}
                    to="/purchase-complete"
                    search={{ product: item.name } as any}
                    className="flex justify-between items-center p-6 bg-white hover:bg-slate-50 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm hover:border-indigo-200 transition-all group"
                  >
                    <span className="font-bold text-slate-900 dark:text-slate-200 group-hover:text-indigo-600 transition-colors text-sm">{item.name}</span>
                    <span className="text-indigo-600 dark:text-indigo-400 font-black text-lg">{item.price}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            4. WORKFLOW BUILDER TAB
            ========================================================= */}
        {activeTab === "builder" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">AI Workflow Builder</h1>
              <p className="text-slate-500 mt-1">Visualizer and layout architect to customize agent action pathways.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Steps Layout */}
              <div className="lg:col-span-2 space-y-6">
                <Card className="p-8">
                  <h3 className="text-lg font-black text-slate-900 dark:text-white mb-6">Workflow: Carrier Dispatch Automation</h3>
                  
                  <div className="space-y-4 relative">
                    {/* Visual connecting line */}
                    <div className="absolute top-8 bottom-8 left-6 w-0.5 bg-slate-100 dark:bg-slate-800 z-0" />

                    {builderSteps.map((step, idx) => (
                      <div 
                        key={step.id} 
                        onClick={() => setSelectedBuilderStep(step.id)}
                        className={`relative z-10 flex gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
                          selectedBuilderStep === step.id 
                            ? "bg-indigo-50/50 border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-800" 
                            : "bg-white border-slate-100 hover:border-slate-200 dark:bg-slate-900 dark:border-slate-800"
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm shrink-0 shadow-sm ${
                          step.type === "trigger" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700"
                        }`}>
                          {step.type === "trigger" ? "⚡" : `0${idx}`}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-sm">{step.name}</span>
                            <Badge variant={step.type === "trigger" ? "warning" : "indigo"}>
                              {step.type}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 mt-1 font-medium leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add action button */}
                  <Button 
                    variant="outline" 
                    className="w-full mt-6 flex items-center justify-center gap-2"
                    onClick={() => {
                      const newStep = {
                        id: builderSteps.length + 1,
                        type: "action",
                        name: "Custom Workflow Module",
                        desc: "Write details or API parameter keys to trigger custom system actions."
                      };
                      setBuilderSteps([...builderSteps, newStep]);
                    }}
                  >
                    <span>➕</span> Add Automation Step
                  </Button>
                </Card>
              </div>

              {/* Step details settings */}
              <div>
                <Card className="p-6 sticky top-8">
                  {selectedBuilderStep ? (
                    (() => {
                      const step = builderSteps.find(s => s.id === selectedBuilderStep);
                      if (!step) return null;
                      return (
                        <div className="space-y-6">
                          <div>
                            <Badge variant={step.type === "trigger" ? "warning" : "indigo"}>{step.type} settings</Badge>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white mt-2">{step.name}</h3>
                          </div>
                          
                          <Input 
                            label="Step Name" 
                            value={step.name}
                            onChange={(e) => {
                              setBuilderSteps(builderSteps.map(s => s.id === step.id ? { ...s, name: e.target.value } : s));
                            }}
                          />

                          <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1.5">Action Instruction Prompt</label>
                            <textarea
                              rows={4}
                              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none resize-none bg-white"
                              value={step.desc}
                              onChange={(e) => {
                                setBuilderSteps(builderSteps.map(s => s.id === step.id ? { ...s, desc: e.target.value } : s));
                              }}
                            />
                          </div>

                          <div className="border-t pt-4">
                            <Button 
                              variant="danger" 
                              size="sm" 
                              onClick={() => {
                                setBuilderSteps(builderSteps.filter(s => s.id !== step.id));
                                setSelectedBuilderStep(null);
                              }}
                            >
                              Delete Step
                            </Button>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      <div className="text-3xl mb-3">⚙️</div>
                      <p className="text-sm font-semibold">Select an automation step in the left panel to configure its prompt rules or API variables.</p>
                    </div>
                  )}
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            5. SUPPORT DESK TAB
            ========================================================= */}
        {activeTab === "tickets" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">Support Desk</h1>
                <p className="text-slate-500 mt-1">Submit tickets to our operations engineers to modify prompts or fix bugs.</p>
              </div>
              <Button onClick={() => setNewTicketModal(true)}>
                📩 Submit New Ticket
              </Button>
            </div>

            <Card className="overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-black uppercase text-slate-400 tracking-wider">
                    <th className="p-4 pl-6">Ticket ID</th>
                    <th className="p-4">Subject</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 pr-6">Created On</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                      <td className="p-4 pl-6 font-mono font-bold text-slate-400">{t.id}</td>
                      <td className="p-4 font-bold text-slate-900">{t.subject}</td>
                      <td className="p-4 font-semibold text-slate-500">{t.category}</td>
                      <td className="p-4">
                        <Badge variant={t.priority === "high" ? "danger" : t.priority === "medium" ? "warning" : "slate"}>
                          {t.priority}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <Badge variant={t.status === "open" ? "blue" : "success"}>
                          {t.status}
                        </Badge>
                      </td>
                      <td className="p-4 pr-6 text-slate-400 font-medium">{t.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* Submit ticket modal */}
            <Modal isOpen={newTicketModal} onClose={() => setNewTicketModal(false)} title="Submit Support Ticket">
              <form onSubmit={handleCreateTicket} className="space-y-5">
                <Input 
                  label="Ticket Subject" 
                  placeholder="e.g. Adjust OCR validation for carrier faxes"
                  value={newTicketSubject}
                  onChange={(e) => setNewTicketSubject(e.target.value)}
                  required
                />
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Priority</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                    value={newTicketPriority}
                    onChange={(e) => setNewTicketPriority(e.target.value)}
                  >
                    <option value="low">Low - General Question</option>
                    <option value="medium">Medium - Behavior Adjustment</option>
                    <option value="high">High - System Blocked / Error</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Category</label>
                  <select 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white"
                    value={newTicketCategory}
                    onChange={(e) => setNewTicketCategory(e.target.value)}
                  >
                    <option value="Integrations">System Integrations</option>
                    <option value="Document AI">Document Processing</option>
                    <option value="Agent Behavior">Agent Prompts & Behavior</option>
                    <option value="Billing">Billing & Administrative</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">Ticket Description</label>
                  <textarea 
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 p-3 text-sm text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    placeholder="Provide details of the bug or modification requested..."
                    value={newTicketDesc}
                    onChange={(e) => setNewTicketDesc(e.target.value)}
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <Button type="submit" className="flex-1">Submit Ticket</Button>
                  <Button variant="outline" type="button" onClick={() => setNewTicketModal(false)}>Cancel</Button>
                </div>
              </form>
            </Modal>
          </div>
        )}

        {/* =========================================================
            6. KNOWLEDGE BASE TAB
            ========================================================= */}
        {activeTab === "knowledge" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">Knowledge Base</h1>
              <p className="text-slate-500 mt-1">Read technical articles and documentation on configuring your AI coworkers.</p>
            </div>

            {/* Search Bar */}
            <div className="max-w-xl">
              <Input 
                placeholder="🔍 Search articles (e.g. OCR, webhook, upload)..." 
                value={kbSearch}
                onChange={(e) => setMockKbSearch(e.target.value)}
              />
            </div>

            {/* Articles List */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {mockKnowledgeBase
                .filter(a => a.title.toLowerCase().includes(kbSearch.toLowerCase()) || a.excerpt.toLowerCase().includes(kbSearch.toLowerCase()))
                .map((art) => (
                  <Card key={art.id} className="p-6 space-y-4">
                    <Badge variant="indigo">{art.category}</Badge>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white hover:text-indigo-600 cursor-pointer">{art.title}</h3>
                    <p className="text-sm text-slate-500 leading-relaxed font-semibold">{art.excerpt}</p>
                    <button className="text-sm font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                      Read Article <span>→</span>
                    </button>
                  </Card>
                ))}
            </div>
          </div>
        )}

        {/* =========================================================
            7. BILLING & INVOICES TAB
            ========================================================= */}
        {activeTab === "billing" && (
          <div className="space-y-10 animate-in fade-in duration-200">
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white">Billing & Subscription</h1>
              <p className="text-slate-500 mt-1">View your current subscription plan, download previous invoices, or update details.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Plan Card */}
              <Card className="p-8 lg:col-span-1 bg-gradient-to-br from-indigo-900 to-indigo-950 text-white shadow-xl shadow-indigo-100 flex flex-col justify-between">
                <div className="space-y-4">
                  <Badge variant="indigo" className="bg-white/10 text-white border-white/20">Active Subscription</Badge>
                  <h3 className="text-2xl font-black">Essential Monthly Ops</h3>
                  <p className="text-indigo-200 text-sm font-semibold">2 AI Deployed Coworkers • Ongoing Bug Fixes & Adjustments</p>
                  <div className="text-4xl font-black pt-4">$750<span className="text-base text-indigo-300 font-bold"> / mo</span></div>
                </div>
                <div className="pt-8 space-y-3">
                  <Link to="/purchase-complete" search={{ product: "Professional Monthly Ops" } as any} className="block w-full text-center bg-white text-indigo-900 py-3 rounded-xl font-bold hover:bg-indigo-50 transition-all text-sm shadow-md">
                    Upgrade to Professional Ops
                  </Link>
                  <p className="text-[10px] text-center text-indigo-400 font-bold uppercase tracking-wider">Next billing date: Aug 1, 2026</p>
                </div>
              </Card>

              {/* Invoice History Table */}
              <div className="lg:col-span-2 space-y-6">
                <h3 className="text-xl font-black text-slate-900 dark:text-white">Invoice History</h3>
                <Card className="overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-xs font-black uppercase text-slate-400 tracking-wider">
                        <th className="p-4 pl-6">Invoice ID</th>
                        <th className="p-4">Billing Period</th>
                        <th className="p-4">Amount</th>
                        <th className="p-4 pr-6">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {mockInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors text-sm">
                          <td className="p-4 pl-6 font-mono font-bold text-slate-400">{inv.id}</td>
                          <td className="p-4 font-bold text-slate-900">{inv.date}</td>
                          <td className="p-4 font-semibold text-slate-500">{inv.amount} ({inv.plan})</td>
                          <td className="p-4 pr-6">
                            <Badge variant="success">{inv.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================
            8. USER MANAGEMENT / TEAM TAB
            ========================================================= */}
        {activeTab === "team" && (
          <div className="space-y-8 animate-in fade-in duration-200">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-black text-slate-900 dark:text-white">User & Team Management</h1>
                <p className="text-slate-500 mt-1">Manage team access credentials, invitation status, or configure roles.</p>
              </div>
              <Button size="sm">➕ Invite Team Member</Button>
            </div>

            <Card className="overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 text-xs font-black uppercase text-slate-400 tracking-wider">
                    <th className="p-4 pl-6">Full Name</th>
                    <th className="p-4">Email Address</th>
                    <th className="p-4">Role Assigned</th>
                    <th className="p-4 pr-6">Activity Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {mockTeamMembers.map((member, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-sm">
                      <td className="p-4 pl-6 font-bold text-slate-900">{member.name}</td>
                      <td className="p-4 text-slate-500 font-semibold">{member.email}</td>
                      <td className="p-4 text-slate-700 font-semibold">{member.role}</td>
                      <td className="p-4 pr-6">
                        <Badge variant={member.status === "Active" ? "success" : "slate"}>
                          {member.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        )}

      </main>
    </div>
  );
}
