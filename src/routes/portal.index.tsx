import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AnimatedNumber } from "~/components/ui";

export const Route = createFileRoute("/portal/")({
  component: ActivityHubDashboard,
});

type TimeFilter = "24h" | "7d" | "30d";

function ActivityHubDashboard() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState("");
  const [integrationsCount, setIntegrationsCount] = useState(0);
  const [connectedCount, setConnectedCount] = useState(0);
  const [billing, setBilling] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("24h");
  const [feedback, setFeedback] = useState("");

  const fetchDashboardData = async () => {
    try {
      try {
        const rMe = await fetch("/api/me", { credentials: "include" });
        if (rMe.ok) { const dMe = await rMe.json(); setUserEmail(dMe.email || ""); }
      } catch {}

      const rEmp = await fetch("/api/data/employees", { credentials: "include" });
      const dEmp = await rEmp.json();
      setEmployees(dEmp.data || []);

      const rTasks = await fetch("/api/data/tasks", { credentials: "include" });
      const dTasks = await rTasks.json();
      setTasks(dTasks.data || []);

      const rApp = await fetch("/api/data/approvals", { credentials: "include" });
      const dApp = await rApp.json();
      setApprovals(dApp.data || []);

      try {
        const rBil = await fetch("/api/data/billing", { credentials: "include" });
        if (rBil.ok) { const dBil = await rBil.json(); setBilling(dBil.data || []); }
      } catch {}

      try {
        const rInt = await fetch("/api/integrations/providers", { credentials: "include" });
        if (rInt.ok) { const dInt = await rInt.json(); setIntegrationsCount(dInt.data?.length || dInt.length || 180); }
      } catch { setIntegrationsCount(180); }

      try {
        const rCon = await fetch("/api/integrations", { credentials: "include" });
        if (rCon.ok) { const dCon = await rCon.json(); setConnectedCount(dCon.data?.length || dCon.length || 0); }
      } catch {}

      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  // ── Derived data ──────────────────────────────────────────────────

  const filterHours = timeFilter === "24h" ? 24 : timeFilter === "7d" ? 168 : 720;
  const now = Date.now();
  const filteredTasks = tasks.filter((t: any) => {
    const ts = t.timestamp ? new Date(t.timestamp).getTime() : (t.createdAt ? new Date(t.createdAt).getTime() : 0);
    return (now - ts) <= filterHours * 3600 * 1000;
  });

  const totalFilteredTasks = filteredTasks.length;
  const hoursSaved = (totalFilteredTasks * 0.15).toFixed(1);
  const roiValue = (totalFilteredTasks * 0.15 * 45).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const activeEmployees = employees.filter((e: any) => e.status === "Active");
  const idleEmployees = employees.filter((e: any) => e.status === "Idle");
  const errorEmployees = employees.filter((e: any) => e.status !== "Active" && e.status !== "Idle");

  const pendingApprovals = approvals.length;
  const hasActionItems = pendingApprovals > 0 || errorEmployees.length > 0;

  // ── Onboarding ────────────────────────────────────────────────────

  const isNewUser = employees.length === 0;
  const onboardingSteps = [
    { label: "Deploy your first AI Employee", done: employees.length > 0, link: "/portal/marketplace" },
    { label: "Connect at least one integration", done: connectedCount > 0, link: "/portal/integrations" },
    { label: "Run your first workflow", done: tasks.length > 0, link: "/portal/workflows" },
    { label: "Review AI activity feed", done: tasks.length >= 3, link: "/portal" },
  ];
  const onboardingProgress = onboardingSteps.filter(s => s.done).length;

  // ── Approval actions ──────────────────────────────────────────────

  const handleApprovalAction = async (id: string, action: string) => {
    try {
      setFeedback(`Processing: ${action}...`);
      await fetch("/api/action", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ action: "approval_" + action.toLowerCase(), resource: id }),
      });
      const target = approvals.find(a => a.id === id || a._id === id);
      if (target?._id) await fetch(`/api/data/approvals/${target._id}`, { method: "DELETE", credentials: "include" });
      setApprovals(approvals.filter(a => a.id !== id && a._id !== id));
      setFeedback(`✓ ${action}ed`);
      setTimeout(() => setFeedback(""), 3000);
    } catch { setFeedback("Failed"); setTimeout(() => setFeedback(""), 3000); }
  };

  // ── Health status ─────────────────────────────────────────────────

  const healthDot = (status: string) => {
    if (status === "Active") return "🟢";
    if (status === "Idle") return "🟡";
    return "🔴";
  };

  // ── Loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const firstName = userEmail ? userEmail.split("@")[0] : "there";
  const timeLabel = timeFilter === "24h" ? "today" : timeFilter === "7d" ? "this week" : "this month";

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">

      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">Activity Hub</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 18 ? "Afternoon" : "Evening"}, {firstName}.
            </h1>
            <p className="text-stone-400 text-sm mt-1 max-w-xl leading-relaxed">
              {totalFilteredTasks > 0
                ? `Your AI workforce completed ${totalFilteredTasks} tasks ${timeLabel}, saving an estimated ${hoursSaved} hours.`
                : `Your Activity Hub — monitor your AI workforce and take action ${timeLabel}.`}
            </p>
          </div>
          {/* Time filter toggles */}
          <div className="flex items-center gap-1 bg-stone-950 border border-stone-900 rounded-xl p-1 shrink-0">
            {(["24h", "7d", "30d"] as TimeFilter[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  timeFilter === tf
                    ? "bg-stone-800 text-white"
                    : "text-stone-500 hover:text-stone-300"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Action-Needed Banner ────────────────────────────────── */}
      {hasActionItems && (
        <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <span className="font-bold text-amber-400 text-sm">Action Needed</span>
              <span className="text-stone-400 text-xs ml-3">
                {pendingApprovals > 0 && `${pendingApprovals} approval${pendingApprovals > 1 ? "s" : ""} pending`}
                {pendingApprovals > 0 && errorEmployees.length > 0 && " · "}
                {errorEmployees.length > 0 && `${errorEmployees.length} AI${errorEmployees.length > 1 ? "s" : ""} need${errorEmployees.length === 1 ? "s" : ""} attention`}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {pendingApprovals > 0 && (
              <button onClick={() => document.getElementById("approvals-section")?.scrollIntoView({ behavior: "smooth" })}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all">
                Review Approvals
              </button>
            )}
            {errorEmployees.length > 0 && (
              <Link to="/portal/employees" className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs px-4 py-2 rounded-lg transition-all">
                Check Health →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── AI Health Summary Row ───────────────────────────────── */}
      {employees.length > 0 && (
        <div className="bg-stone-950 border border-stone-900 rounded-xl px-5 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">AI Health</span>
            <Link to="/portal/employees" className="text-[10px] font-mono text-blue-400 hover:text-blue-300 font-bold">All Employees →</Link>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {employees.slice(0, 8).map((emp: any) => (
              <Link key={emp.id || emp._id} to="/portal/employees/$id" params={{ id: emp.id || emp._id }}
                className="flex items-center gap-2 text-xs group">
                <span>{healthDot(emp.status)}</span>
                <span className="text-stone-300 group-hover:text-white transition-colors font-medium truncate max-w-[120px]">{emp.name}</span>
              </Link>
            ))}
            {employees.length > 8 && (
              <span className="text-[10px] text-stone-600 font-mono">+{employees.length - 8} more</span>
            )}
          </div>
        </div>
      )}

      {/* ── Onboarding checklist for new users ──────────────────── */}
      {isNewUser && (
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-8 text-center max-w-xl mx-auto">
          <div className="text-4xl mb-4">🚀</div>
          <h3 className="text-lg font-bold text-white mb-2">Welcome to Simpler Life 100</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm mx-auto leading-relaxed">
            Your AI workforce dashboard populates once you deploy your first AI Employee. Here's how to get started:
          </p>
          <div className="space-y-3 text-left max-w-xs mx-auto mb-6">
            {onboardingSteps.map((step, i) => (
              <Link key={i} to={step.link as any}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                  step.done
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 line-through opacity-60"
                    : "bg-stone-900 border border-stone-800 text-stone-200 hover:border-stone-700 hover:bg-stone-800"
                }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  step.done ? "bg-emerald-500/20 text-emerald-400" : "bg-stone-800 text-stone-400"
                }`}>{step.done ? "✓" : i + 1}</span>
                {step.label}
              </Link>
            ))}
          </div>
          <Link to="/portal/marketplace"
            className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg active:scale-95">
            🛒 Browse AI Employees
          </Link>
        </div>
      )}

      {/* ── Hero Metrics ────────────────────────────────────────── */}
      {!isNewUser && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Hours Saved", value: `${hoursSaved} hrs`, subtitle: `${timeLabel}`, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20" },
            { label: "Est. ROI", value: `$${roiValue}`, subtitle: "@ $45/hr baseline", color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" },
            { label: "Active AIs", value: `${activeEmployees.length}`, subtitle: `${employees.length} total`, color: "text-purple-400", bg: "bg-purple-500/5 border-purple-500/20" },
            { label: "Tasks", value: `${totalFilteredTasks}`, subtitle: `${timeLabel}`, color: "text-amber-400", bg: "bg-amber-500/5 border-amber-500/20" },
          ].map((m, i) => (
            <div key={i} className={`rounded-xl border p-5 ${m.bg} flex flex-col justify-between gap-3`}>
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-bold">{m.label}</span>
              <div>
                <p className={`text-2xl font-black ${m.color}`}><AnimatedNumber value={m.value} /></p>
                <span className="text-[10px] text-stone-500 font-mono">{m.subtitle}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Grid ───────────────────────────────────────────── */}
      {!isNewUser && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left: AI Employees + Activity Feed */}
          <div className="lg:col-span-2 space-y-8">

            {/* AI Employee Cards */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-black tracking-tight text-white">🤖 AI Workforce</h2>
                <Link to="/portal/employees" className="text-[10px] font-mono font-bold text-blue-400 hover:text-blue-300">Manage →</Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {employees.slice(0, 4).map((emp: any) => {
                  const empTasks = tasks.filter((t: any) => t.aiEmployee === emp.name).slice(0, 2);
                  return (
                    <Link key={emp.id || emp._id} to="/portal/employees/$id" params={{ id: emp.id || emp._id }}
                      className="bg-stone-950 border border-stone-900 rounded-xl p-5 hover:border-stone-800 transition-all block group">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">{emp.name}</h3>
                          <p className="text-[10px] text-stone-500 mt-0.5">{emp.agentType?.replace(/_/g, " ") || "AI Agent"}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono uppercase font-bold ${
                          emp.status === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                          emp.status === "Idle" ? "bg-stone-900 text-stone-400 border border-stone-800" :
                          "bg-red-950/40 text-red-400 border border-red-900"
                        }`}>
                          {healthDot(emp.status)} {emp.status}
                        </span>
                      </div>
                      {/* Recent Activity */}
                      {empTasks.length > 0 ? (
                        <div className="space-y-1.5 pt-3 border-t border-stone-900">
                          {empTasks.map((t: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[10px]">
                              <span className="text-stone-600 shrink-0">{t.status === "Completed" ? "✓" : "⚡"}</span>
                              <span className="text-stone-400 truncate">{t.result}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="pt-3 border-t border-stone-900 text-[10px] text-stone-600">No recent activity</div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Activity Feed */}
            <div className="space-y-4">
              <h2 className="text-sm font-black tracking-tight text-white">⚡ Activity Feed</h2>
              <div className="bg-stone-950 border border-stone-900 rounded-xl divide-y divide-stone-900 overflow-hidden">
                {filteredTasks.slice(0, 8).length === 0 ? (
                  <div className="p-6 text-center text-stone-500 text-xs">No activity {timeLabel}.</div>
                ) : (
                  filteredTasks.slice(0, 8).map((task: any, idx: number) => (
                    <div key={idx} className="p-4 hover:bg-stone-900/30 transition-colors flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`shrink-0 text-[10px] ${task.status === "Completed" ? "text-emerald-500" : "text-blue-400"}`}>
                          {task.status === "Completed" ? "✓" : "⚡"}
                        </span>
                        <div className="min-w-0">
                          <span className="font-bold text-white text-[11px]">{task.aiEmployee}</span>
                          <span className="text-stone-600 mx-1.5 text-[10px]">•</span>
                          <span className="text-stone-400 text-[11px] truncate">{task.result}</span>
                        </div>
                      </div>
                      <span className="text-stone-600 shrink-0 text-[10px] font-mono">
                        {task.timestamp ? new Date(task.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right: Sidebar widgets */}
          <div className="space-y-6" id="approvals-section">

            {/* Pending Approvals */}
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-white">📥 Pending Approvals</h3>
                {pendingApprovals > 0 && (
                  <span className="bg-amber-500/10 text-amber-400 text-[9px] font-bold px-2 py-0.5 rounded-md border border-amber-500/20">{pendingApprovals}</span>
                )}
              </div>
              {approvals.length === 0 ? (
                <div className="text-center py-6">
                  <div className="text-xl mb-1">🎉</div>
                  <p className="text-[10px] font-bold text-stone-400">All clear</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {approvals.slice(0, 3).map((app: any) => (
                    <div key={app.id || app._id} className="bg-stone-900/50 border border-stone-800 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="text-stone-500 truncate">{app.id?.slice(0, 12) || "PENDING"}</span>
                        <span className="text-blue-400">{app.confidenceScore}% conf.</span>
                      </div>
                      <p className="text-[10px] font-bold text-white leading-snug">{app.type}</p>
                      <p className="text-[9px] text-stone-400 leading-relaxed bg-stone-950 rounded-lg p-2">{app.suggestedDecision}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button onClick={() => handleApprovalAction(app.id || app._id, "Approve")}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 rounded-lg transition-all">Approve</button>
                        <button onClick={() => handleApprovalAction(app.id || app._id, "Reject")}
                          className="bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold py-1.5 rounded-lg border border-stone-700 transition-all">Reject</button>
                      </div>
                    </div>
                  ))}
                  {approvals.length > 3 && (
                    <Link to="/portal/approvals" className="block text-center text-[10px] font-mono text-blue-400 hover:text-blue-300 pt-1">
                      +{approvals.length - 3} more →
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Billing / Usage Alert */}
            {billing.length === 0 && employees.length > 0 && (
              <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold">💳 Billing</span>
                <p className="text-[10px] text-stone-400 leading-relaxed">
                  No active billing plan detected. Your AI workforce is running on trial mode.
                </p>
                <Link to="/portal/billing"
                  className="block text-center text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition-all">
                  View Plans
                </Link>
              </div>
            )}
            {billing.length > 0 && (
              <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">💳 Active Plan</span>
                <p className="text-[10px] text-stone-400 leading-relaxed">
                  Your billing plan is active. {billing.length} invoice{billing.length > 1 ? "s" : ""} on record.
                </p>
                <Link to="/portal/billing"
                  className="block text-center text-[10px] font-bold bg-stone-800 hover:bg-stone-700 text-stone-200 py-2 rounded-lg border border-stone-700 transition-all">
                  View Billing →
                </Link>
              </div>
            )}

            {/* Connected Integrations */}
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-black text-white">🔌 Connected Integrations</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-stone-400 font-mono">Available</span>
                  <span className="text-[10px] font-bold text-white">{integrationsCount}+</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-stone-400 font-mono">Connected</span>
                  <span className="text-[10px] font-bold text-emerald-400">{connectedCount}</span>
                </div>
                <div className="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-full rounded-full transition-all"
                    style={{ width: `${integrationsCount > 0 ? Math.min((connectedCount / integrationsCount) * 100, 100) : 0}%` }} />
                </div>
              </div>
              <Link to="/portal/integrations"
                className="block text-center text-[10px] font-bold bg-stone-800 hover:bg-stone-700 text-stone-200 py-2 rounded-lg border border-stone-700 transition-all">
                Connect Tools →
              </Link>
            </div>

            {/* Onboarding progress (returning users with incomplete setup) */}
            {!isNewUser && onboardingProgress < 4 && (
              <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-white">🚀 Setup Progress</h3>
                  <span className="text-[9px] font-mono text-stone-500">{onboardingProgress}/4</span>
                </div>
                <div className="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${(onboardingProgress / 4) * 100}%` }} />
                </div>
                <div className="space-y-1">
                  {onboardingSteps.filter(s => !s.done).slice(0, 2).map((step, i) => (
                    <Link key={i} to={step.link as any}
                      className="flex items-center gap-2 text-[10px] text-stone-400 hover:text-white transition-colors py-1">
                      <span className="w-4 h-4 rounded-full bg-stone-800 flex items-center justify-center text-[8px] text-stone-500 shrink-0">{i + 1}</span>
                      {step.label} →
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Feedback Toast ──────────────────────────────────────── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-800 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-slideUp font-mono text-xs">
          <span className="text-emerald-400">✓</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}
