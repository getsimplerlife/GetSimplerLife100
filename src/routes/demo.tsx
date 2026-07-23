import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/demo")({
  component: PortalDemoPage,
});

interface DemoAgent {
  name: string;
  type: string;
  status: "Active" | "Idle" | "Paused";
  purpose: string;
  performance: number;
  icon: string;
}

interface DemoActivity {
  agent: string;
  action: string;
  time: string;
  status: "success" | "pending" | "warning";
}

const MOCK_AGENTS: DemoAgent[] = [
  { name: "Ivy Invoice", type: "Invoice & Ledger AI", status: "Active", purpose: "Invoice processing, PO matching, payment reconciliation", performance: 99, icon: "💸" },
  { name: "Charlie CRM", type: "Sales Outreach AI", status: "Active", purpose: "Lead enrichment, deal tracking, email sequencing", performance: 97, icon: "🚀" },
  { name: "Quentin Quote", type: "Dispatch Logistics AI", status: "Active", purpose: "Carrier bid matching, route optimization, ETA tracking", performance: 98, icon: "📦" },
  { name: "Caleb Collections", type: "Invoice & Ledger AI", status: "Idle", purpose: "Dunning, past-due follow-ups, payment reminders", performance: 95, icon: "💸" },
  { name: "Sarah Jenkins", type: "Operations Audit AI", status: "Paused", purpose: "Operational audit logging, anomaly detection, report generation", performance: 93, icon: "⚙️" },
];

const MOCK_ACTIVITIES: DemoActivity[] = [
  { agent: "Ivy Invoice", action: "Processed invoice INV-2026-442 from Acme Corp — $12,440.00", time: "2 min ago", status: "success" },
  { agent: "Charlie CRM", action: "Enriched 14 new leads from LinkedIn — 3 matched to existing contacts", time: "5 min ago", status: "success" },
  { agent: "Quentin Quote", action: "Matched 8 carrier bids to load L-9923 — optimal rate found", time: "8 min ago", status: "success" },
  { agent: "Ivy Invoice", action: "Flagged PO-10229 mismatch — $450 variance requires review", time: "12 min ago", status: "warning" },
  { agent: "Charlie CRM", action: "Sent 32 follow-up emails in sequence 'Q3 Outreach — Batch 2'", time: "18 min ago", status: "success" },
  { agent: "Caleb Collections", action: "Scheduled 5 payment reminders for accounts 60+ days overdue", time: "25 min ago", status: "pending" },
];

const MOCK_MARKETPLACE = [
  { name: "Invoice & Ledger AI", price: "$950/mo", rating: 4.8, tasks: "42.8k/mo", icon: "💸", category: "Finance" },
  { name: "Sales Outreach AI", price: "$1,200/mo", rating: 4.7, tasks: "8.9k/mo", icon: "🚀", category: "Sales" },
  { name: "Dispatch Logistics AI", price: "$1,800/mo", rating: 4.9, tasks: "25.4k/mo", icon: "📦", category: "Logistics" },
  { name: "Document AI System", price: "$499/mo", rating: 4.9, tasks: "35.7k/mo", icon: "📄", category: "Operations" },
  { name: "Customer Support AI", price: "$1,800/mo", rating: 4.7, tasks: "12.1k/mo", icon: "🎧", category: "Operations" },
  { name: "HR Compliance AI", price: "$850/mo", rating: 4.6, tasks: "5.1k/mo", icon: "👤", category: "HR" },
];

function PortalDemoPage() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "marketplace" | "workflows">("dashboard");

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col selection:bg-emerald-500 selection:text-stone-950">
      {/* Header */}
      <header className="px-6 py-4 border-b border-stone-900 bg-stone-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <Link to="/" className="text-xl font-black text-emerald-500 tracking-tight flex items-center gap-2">
            <span>✨</span> Simpler Life 100
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-[9px] font-black bg-amber-500/20 text-amber-400 px-3 py-1.5 rounded-xl border border-amber-500/30 uppercase tracking-widest">
              DEMO
            </span>
            <Link to="/" className="text-sm font-bold text-stone-400 hover:text-white transition-colors">
              Exit Demo →
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Tab Switcher */}
        <div className="flex gap-1 bg-stone-900/50 border border-stone-800 rounded-xl p-1 mb-8">
          {[
            { key: "dashboard" as const, label: "📊 Dashboard", desc: "Live metrics & activity" },
            { key: "marketplace" as const, label: "🛍️ Marketplace", desc: "Browse AI employees" },
            { key: "workflows" as const, label: "⚡ Workflows", desc: "Automation pipelines" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 text-center py-3 px-4 rounded-lg transition-all ${
                activeTab === tab.key
                  ? "bg-emerald-600 text-white shadow-lg"
                  : "text-stone-500 hover:text-stone-300"
              }`}
            >
              <div className="text-xs font-black tracking-tight">{tab.label}</div>
              <div className="text-[9px] font-mono mt-0.5 opacity-80">{tab.desc}</div>
            </button>
          ))}
        </div>

        {/* ─── DASHBOARD TAB ─── */}
        {activeTab === "dashboard" && (
          <div className="space-y-8 animate-fadeIn">
            {/* Metrics Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { value: "1,247", label: "Tasks Completed", change: "+12% today", icon: "✓" },
                { value: "187 hrs", label: "Hours Saved", change: "This week", icon: "⏱" },
                { value: "5", label: "Active Agents", change: "2 idle, 1 paused", icon: "🤖" },
                { value: "$8,415", label: "ROI Saved", change: "Since deployment", icon: "💰" },
              ].map((metric) => (
                <div key={metric.label} className="bg-stone-900/40 border border-stone-800 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">{metric.label}</span>
                    <span className="text-lg">{metric.icon}</span>
                  </div>
                  <p className="text-2xl font-black text-white">{metric.value}</p>
                  <p className="text-[10px] text-emerald-400 font-mono mt-1">{metric.change}</p>
                </div>
              ))}
            </div>

            {/* Agent Cards */}
            <div className="space-y-4">
              <h2 className="text-sm font-black text-white">🤖 Deployed AI Employees</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {MOCK_AGENTS.map((agent) => (
                  <div key={agent.name} className="bg-stone-900/30 border border-stone-800 rounded-xl p-5 hover:border-stone-700 transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{agent.icon}</span>
                        <div>
                          <p className="text-sm font-bold text-white">{agent.name}</p>
                          <p className="text-[9px] font-mono text-stone-500">{agent.type}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                        agent.status === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                        agent.status === "Idle" ? "bg-stone-900 text-stone-400 border border-stone-800" :
                        "bg-amber-950/40 text-amber-400 border border-amber-900"
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${agent.status === "Active" ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
                        {agent.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-stone-400 leading-relaxed">{agent.purpose}</p>
                    <div className="mt-3 pt-3 border-t border-stone-800 flex justify-between text-[10px] font-mono text-stone-500">
                      <span>Accuracy: {agent.performance}%</span>
                      <span className="text-emerald-400">● Live</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Activity Feed */}
            <div className="space-y-4">
              <h2 className="text-sm font-black text-white">⚡ Live Activity Feed</h2>
              <div className="bg-stone-900/20 border border-stone-800 rounded-xl divide-y divide-stone-800">
                {MOCK_ACTIVITIES.map((act, i) => (
                  <div key={i} className="flex items-center gap-3 p-4 text-[11px]">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${
                      act.status === "success" ? "bg-emerald-500" :
                      act.status === "warning" ? "bg-amber-500" : "bg-stone-500"
                    }`} />
                    <span className="font-bold text-white min-w-[90px]">{act.agent}</span>
                    <span className="text-stone-300 flex-1">{act.action}</span>
                    <span className="text-stone-500 shrink-0">{act.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── MARKETPLACE TAB ─── */}
        {activeTab === "marketplace" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">AI EMPLOYEES MARKETPLACE</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {MOCK_MARKETPLACE.map((item) => (
                <div key={item.name} className="bg-stone-900/30 border border-stone-800 rounded-2xl p-5 hover:border-stone-700 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <div className="h-10 w-10 bg-stone-900 border border-stone-800 rounded-xl flex items-center justify-center text-xl">
                      {item.icon}
                    </div>
                    <span className="text-[9px] font-mono font-bold text-stone-500 uppercase bg-stone-900 border border-stone-800 px-2 py-0.5 rounded-md">
                      {item.category}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">{item.name}</h3>
                  <div className="flex gap-4 text-[10px] font-mono text-stone-500 mt-3">
                    <span>★ {item.rating}</span>
                    <span>{item.tasks}</span>
                  </div>
                  <div className="border-t border-stone-800 pt-4 mt-4 flex justify-between items-center">
                    <span className="text-xs font-bold text-white">{item.price}</span>
                    <button className="text-[10px] font-mono font-bold bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-all">
                      Deploy →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── WORKFLOWS TAB ─── */}
        {activeTab === "workflows" && (
          <div className="space-y-6 animate-fadeIn">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">AUTOMATION WORKFLOWS</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[
                {
                  name: "Invoice Processing Pipeline",
                  desc: "Auto-extract invoice data, match to POs, route for approval, post to QuickBooks",
                  steps: ["📥 Invoice Received", "🧠 OCR Extraction", "🎛️ PO Match", "✅ Approval Gate", "💸 QuickBooks Post"],
                  status: "Active",
                  savings: "$12,400/mo",
                  successRate: "99.2%",
                },
                {
                  name: "Lead-to-Deal Automation",
                  desc: "Capture inbound leads, enrich CRM data, send personalized outreach, track engagement",
                  steps: ["📧 Lead Capture", "🔍 CRM Enrich", "✉️ Email Sequence", "📊 Engagement Track", "🚀 Deal Creation"],
                  status: "Active",
                  savings: "$8,200/mo",
                  successRate: "97.8%",
                },
                {
                  name: "Dispatch Optimization Flow",
                  desc: "Monitor carrier bids, match to loads, calculate optimal routes, send confirmations",
                  steps: ["📦 Load Created", "🔗 Carrier Match", "📍 Route Optimize", "✅ Confirm Dispatch", "📱 Customer Notify"],
                  status: "Active",
                  savings: "$15,600/mo",
                  successRate: "98.5%",
                },
                {
                  name: "Cross-Agent Chain: Invoice → Audit → Slack",
                  desc: "When Invoice AI completes, send to Audit Logger, then notify #ops channel",
                  steps: ["💰 Invoice AI", "→ ⚙️ Audit Logger", "→ 💬 Slack Alert"],
                  status: "Paused",
                  savings: "$3,100/mo",
                  successRate: "96.1%",
                },
              ].map((wf) => (
                <div key={wf.name} className="bg-stone-900/30 border border-stone-800 rounded-2xl p-6 hover:border-stone-700 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">{wf.name}</h3>
                      <p className="text-[10px] text-stone-400 mt-1 leading-relaxed">{wf.desc}</p>
                    </div>
                    <span className={`text-[9px] font-mono font-bold px-2 py-1 rounded-lg ${
                      wf.status === "Active"
                        ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900"
                        : "bg-amber-950/40 text-amber-400 border border-amber-900"
                    }`}>
                      {wf.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 my-4 flex-wrap">
                    {wf.steps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-[10px] bg-stone-900/60 border border-stone-800 px-2.5 py-1.5 rounded-lg font-mono text-stone-300">
                          {step}
                        </span>
                        {i < wf.steps.length - 1 && <span className="text-stone-700 text-xs">→</span>}
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-stone-800 pt-4 flex justify-between text-[10px] font-mono text-stone-500">
                    <span>💰 Savings: <span className="text-emerald-400 font-bold">{wf.savings}</span></span>
                    <span>✓ Success: <span className="text-white font-bold">{wf.successRate}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-900 px-6 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-[10px] font-mono text-stone-600">
          <span>✨ Simpler Life 100 — Interactive Demo</span>
          <Link to="/" className="text-stone-500 hover:text-stone-300 transition-colors">← Back to site</Link>
        </div>
      </footer>
    </div>
  );
}