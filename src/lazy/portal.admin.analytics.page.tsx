import { useState, useEffect } from "react";
// P1-2 honesty: this page previously rendered HARDCODED usage bars (OpenAI 45%…)
// and demo customer rows (mathewortiz97@gmail.com agents:8 calls:342K). KPIs now
// map to REAL aggregate keys served by /api/data/analytics, and breakdowns show
// an honest placeholder until real per-account usage exists.
function AdminAnalyticsPage() {
  const [stats, setStats] = useState<Record<string, string>>({});
  useEffect(() => {
    fetch("/api/data/analytics", { credentials: "include" })
      .then(r => r.json()).then(d => setStats(d.data || {})).catch(() => {});
  }, []);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Platform Analytics</h1>
        <p className="text-stone-400 mt-1">Live aggregates computed from real platform stores.</p>
      </div>
      {/* KPI Cards — real keys from /api/data/analytics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: stats.totalUsers || "—", color: "text-white" },
          { label: "Active Automations", value: stats.totalAgents || "—", color: "text-emerald-400" },
          { label: "Automation Runs", value: stats.totalAgentRuns || "—", color: "text-blue-400" },
          { label: "Uptime", value: stats.uptime || "—", color: "text-amber-400" },
        ].map(s => (
          <div key={s.label} className="bg-stone-900 border border-stone-800 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>
      {/* Breakdowns — honest placeholder (P1-2; the hardcoded API-usage bars and
          demo customer rows were removed) */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-8 text-center">
        <p className="text-xs text-stone-500">Usage breakdowns aren't available yet — they'll appear here as accounts are used.</p>
      </div>
    </div>
  );
}
export default AdminAnalyticsPage;