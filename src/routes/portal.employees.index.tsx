import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/employees/")({
  component: AIEmployeesWorkspaceHub,
});

function AIEmployeesWorkspaceHub() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [editPanel, setEditPanel] = useState<{ emp: any } | null>(null);

  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Refresh from API on client mount for live status/purchase data
  useEffect(() => {
    fetch("/api/data/employees", { credentials: "include" })
      .then(r => r.json())
      .then(d => {
        if (d.data && d.data.length > 0) setEmployees(d.data);
        setLoading(false);
      })
      .catch(() => { setLoading(false); });
  }, []);

  // Per-agent status from runtime API (always client-side)
  const [agentStatuses, setAgentStatuses] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [runResults, setRunResults] = useState<Record<string, any>>({});  // pipeline results per agent

  // Fetch agent statuses on mount (client-side only)
  useEffect(() => {
    if (employees.length === 0) return;
    const statusPromises = employees
      .map((emp: any) => emp.id || emp._id)
      .filter(Boolean)
      .map((agentId: string) =>
        fetch(`/api/agents/${agentId}/status`, { credentials: "include" })
          .then(r => r.json())
          .then(s => ({ agentId, s }))
          .catch(() => null)
      );
    Promise.all(statusPromises).then(results => {
      const statusMap: Record<string, any> = {};
      for (const r of results) {
        if (r) statusMap[r.agentId] = r.s;
      }
      setAgentStatuses(statusMap);
    });
  }, [employees.length]);

  const handleAgentAction = async (emp: any, action: "pause" | "resume" | "run") => {
    const agentId = emp.id || emp._id;
    setActionLoading(prev => ({ ...prev, [agentId]: action }));
    setFeedback(`${action === "pause" ? "Pausing" : action === "resume" ? "Resuming" : "Starting"} ${emp.name}...`);

    try {
      let res: Response;
      if (action === "run") {
        res = await fetch("/api/agents/run", {
          method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
          body: JSON.stringify({ agentId, prompt: `Execute ${emp.purpose || "your task"}`, context: {} }),
        });
      } else {
        res = await fetch(`/api/agents/${agentId}/${action}`, {
          method: "POST", credentials: "include",
        });
      }

      if (res.ok) {
        const data = await res.json();
        // Update local state
        setEmployees(emps => emps.map(e => {
          if ((e.id || e._id) === agentId) {
            return { ...e, status: action === "pause" ? "Paused" : action === "resume" ? "Active" : e.status };
          }
          return e;
        }));
        // Refresh status
        const sRes = await fetch(`/api/agents/${agentId}/status`, { credentials: "include" });
        if (sRes.ok) {
          const sData = await sRes.json();
          setAgentStatuses(prev => ({ ...prev, [agentId]: sData }));
        }
        // For run action, store pipeline results for display
        if (action === "run") {
          setRunResults(prev => ({ ...prev, [agentId]: data }));
          const insightCount = data.insights?.length || 0;
          const alertCount = data.alerts?.length || 0;
          const actionCount = data.actionsTaken?.filter((a: any) => a.status === "executed").length || 0;
          setFeedback(`✓ ${emp.name} ran — ${insightCount} insight${insightCount !== 1 ? "s" : ""}, ${alertCount} alert${alertCount !== 1 ? "s" : ""}, ${actionCount} action${actionCount !== 1 ? "s" : ""}`);
        } else {
          setFeedback(`✓ ${action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Started"} ${emp.name}`);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 402) {
          setFeedback(`🔒 Purchase required to run ${emp.name}`);
        } else {
          setFeedback(`Failed to ${action} ${emp.name}: ${errData.error || res.status}`);
        }
      }
    } catch {
      setFeedback(`Error: Could not ${action} ${emp.name}`);
    }
    setTimeout(() => setFeedback(""), 3000);
    setActionLoading(prev => { const n = { ...prev }; delete n[agentId]; return n; });
  };

  const handleSaveCapabilities = async (emp: any, updates: Record<string, any>) => {
    setFeedback(`Updating ${emp.name} capabilities...`);
    try {
      await fetch("/api/data/employees", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ id: emp.id || emp._id, ...updates }),
      });
      setEmployees(emps => emps.map(e => {
        if ((e.id || e._id) === (emp.id || emp._id)) return { ...e, ...updates };
        return e;
      }));
      setFeedback(`✓ ${emp.name} updated`);
      setEditPanel(null);
    } catch {
      setFeedback("Failed to save capabilities");
    }
    setTimeout(() => setFeedback(""), 3000);
  };

  const getAgentId = (emp: any) => emp.id || emp._id;

  const filtered = employees.filter((emp: any) => {
    const m = emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              emp.purpose?.toLowerCase().includes(searchTerm.toLowerCase()) ||
              emp.agentType?.toLowerCase().includes(searchTerm.toLowerCase());
    const s = statusFilter === "all" || emp.status?.toLowerCase() === statusFilter.toLowerCase();
    return m && s;
  });

  // Normalize status: handle lowercase/weird values from API
  const normalizeStatus = (status: string) => {
    const s = (status || "").toLowerCase();
    if (s === "active") return "Active";
    if (s === "paused") return "Paused";
    if (s === "idle" || s === "available") return "Idle";
    return status || "Idle";
  };

  const activeCount = employees.filter((e: any) => normalizeStatus(e.status) === "Active").length;
  const idleCount = employees.filter((e: any) => normalizeStatus(e.status) === "Idle").length;
  const errorCount = employees.filter((e: any) => {
    const s = normalizeStatus(e.status);
    return s !== "Active" && s !== "Idle" && s !== "Paused";
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">Workspace Hub</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">🤖 AI Employees</h1>
        <p className="text-stone-400 text-sm max-w-2xl leading-relaxed">
          Monitor, control, and configure your autonomous AI workforce.
        </p>
      </div>

      {/* ── Empty State ────────────────────────────────────────── */}
      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-16 bg-stone-950 border border-stone-900 rounded-2xl max-w-xl mx-auto">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-bold text-white mb-2">No AI employees yet</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm leading-relaxed">
            Purchase AI employees from the Marketplace to build your automation workforce.
          </p>
          <Link to="/portal/marketplace"
            className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg active:scale-95">
            🛒 Browse Marketplace
          </Link>
        </div>
      ) : (
        <>
          {/* ── Health Summary ──────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Active", count: activeCount, color: "emerald", dot: "🟢" },
              { label: "Idle", count: idleCount, color: "amber", dot: "🟡" },
              { label: "Error/Paused", count: errorCount, color: "red", dot: "🔴" },
            ].map(s => (
              <div key={s.label} className="bg-stone-950 border border-stone-900 rounded-xl p-4 text-center">
                <span className="text-lg">{s.dot}</span>
                <p className="text-2xl font-black text-white mt-1">{s.count}</p>
                <span className="text-[10px] font-mono text-stone-500 uppercase tracking-wider">{s.label}</span>
              </div>
            ))}
          </div>

          {/* ── Filters ─────────────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row gap-3 bg-stone-950 border border-stone-900 rounded-xl p-3">
            <input
              type="text" placeholder="Search by name, type, or purpose..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="flex-1 bg-stone-900/50 border border-stone-800 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-700 text-stone-200 placeholder-stone-600"
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="bg-stone-900/50 border border-stone-800 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-700 text-stone-400">
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          {/* ── Employee Cards ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((emp: any) => {
              const agentId = getAgentId(emp);
              const runtimeStatus = agentStatuses[agentId];
              const lastExec = runtimeStatus?.lastExecutions?.[0];
              const isLoading = !!actionLoading[agentId];

              return (
                <div key={agentId} className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4 hover:border-stone-800 transition-all">
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to="/portal/employees/$id" params={{ id: agentId }}
                        className="text-sm font-bold text-white hover:text-blue-400 transition-colors block truncate">
                        {emp.name}
                      </Link>
                      <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                        {emp.agentType?.replace(/_/g, " ") || "AI Agent"} · v{emp.version || "1.0"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                    {(() => {
                      const ns = normalizeStatus(emp.status);
                      return (
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono uppercase font-bold ${
                    ns === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                    ns === "Idle" ? "bg-stone-900 text-stone-400 border border-stone-800" :
                    ns === "Paused" ? "bg-amber-950/40 text-amber-400 border border-amber-900" :
                    "bg-red-950/40 text-red-400 border border-red-900"
                    }`}>
                    <span className={`h-1 w-1 rounded-full ${
                      ns === "Active" ? "bg-emerald-400 animate-pulse" :
                      ns === "Paused" ? "bg-amber-400" :
                      ns === "Idle" ? "bg-stone-500" : "bg-red-400"
                    }`} />
                    {ns}
                    </span>
                      );
                    })()}
                    </div>
                  </div>

                  {/* Purpose */}
                  <p className="text-[11px] text-stone-400 leading-relaxed">{emp.purpose}</p>

                  {/* Current Task */}
                  {lastExec && (
                    <div className="bg-stone-900/50 border border-stone-800 rounded-lg p-3">
                      <span className="text-[9px] font-mono uppercase text-stone-500 font-bold tracking-wider">Current Task</span>
                      <p className="text-[10px] text-stone-300 mt-1 truncate">{lastExec.prompt || "Idle — awaiting instruction"}</p>
                      <div className="flex gap-4 mt-1.5 text-[9px] font-mono">
                        <span className={lastExec.status === "completed" ? "text-emerald-400" : lastExec.status === "failed" ? "text-red-400" : "text-amber-400"}>
                          {lastExec.status}
                        </span>
                        {lastExec.duration && <span className="text-stone-600">{lastExec.duration}ms</span>}
                      </div>
                    </div>
                  )}

                  {/* Performance bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-mono">
                      <span className="text-stone-500">Performance</span>
                      <span className="text-stone-400">{emp.performance || 100}%</span>
                    </div>
                    <div className="w-full bg-stone-900 rounded-full h-1 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all"
                        style={{ width: `${emp.performance || 100}%` }} />
                    </div>
                  </div>

                  {/* Pipeline Results (shown after Run) */}
                  {runResults[agentId] && (
                    <PipelineResultsCard
                      result={runResults[agentId]}
                      agentName={emp.name}
                      onDismiss={() => setRunResults(prev => { const n = { ...prev }; delete n[agentId]; return n; })}
                    />
                  )}

                  {/* Controls */}
                  <div className="flex gap-2 pt-1">
                    {emp.status !== "Active" && emp.status !== "Paused" && (
                      <button onClick={() => handleAgentAction(emp, "run")} disabled={isLoading}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] py-2 rounded-lg transition-all disabled:opacity-50">
                        {isLoading ? "..." : "▶ Start"}
                      </button>
                    )}
                    {emp.status === "Active" && (
                      <button onClick={() => handleAgentAction(emp, "pause")} disabled={isLoading}
                        className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold text-[10px] py-2 rounded-lg transition-all disabled:opacity-50">
                        {isLoading ? "..." : "⏸ Pause"}
                      </button>
                    )}
                    {(emp.status === "Paused" || emp.status === "Idle") && (
                      <button onClick={() => handleAgentAction(emp, "resume")} disabled={isLoading}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] py-2 rounded-lg transition-all disabled:opacity-50">
                        {isLoading ? "..." : "▶ Resume"}
                      </button>
                    )}
                    <Link to="/portal/integrations" search={{ filter: emp.agentType }}
                      className="bg-indigo-800 hover:bg-indigo-700 text-indigo-200 font-bold text-[10px] px-3 py-2 rounded-lg transition-all">
                      🔌 Connect
                    </Link>
                    <button onClick={() => setEditPanel({ emp })}
                      className="bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-[10px] px-3 py-2 rounded-lg transition-all">
                      ⚙️ Edit
                    </button>
                    <Link to="/portal/employees/$id" params={{ id: agentId }}
                      className="bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-[10px] px-3 py-2 rounded-lg transition-all">
                      Profile →
                    </Link>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full text-center py-12 text-stone-500 text-xs font-mono">
                No AI employees match filters.
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Edit Capabilities Slide-Out Panel ──────────────────── */}
      {editPanel && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditPanel(null)} />
          <div className="relative w-full max-w-md bg-stone-950 border-l border-stone-900 h-full overflow-y-auto animate-slideUp">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black text-white">⚙️ Edit Capabilities</h2>
                <button onClick={() => setEditPanel(null)}
                  className="text-stone-500 hover:text-white text-xl leading-none">&times;</button>
              </div>

              <div className="space-y-2">
                <span className="text-[9px] font-mono uppercase text-stone-500 tracking-wider">Agent</span>
                <p className="text-sm font-bold text-white">{editPanel.emp.name}</p>
                <p className="text-[10px] text-stone-400 font-mono">{editPanel.emp.agentType?.replace(/_/g, " ")}</p>
              </div>

              <CapabilityForm emp={editPanel.emp} onSave={handleSaveCapabilities} onCancel={() => setEditPanel(null)} />

              <div className="pt-4 border-t border-stone-900">
                <span className="text-[9px] font-mono uppercase text-stone-500 tracking-wider block mb-2">Agent Type Info</span>
                <div className="space-y-2 text-[10px] font-mono">
                  <div className="flex justify-between"><span className="text-stone-500">Type</span><span className="text-stone-300">{editPanel.emp.agentType}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Version</span><span className="text-stone-300">{editPanel.emp.version || "1.0"}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Status</span><span className="text-stone-300">{editPanel.emp.status}</span></div>
                  <div className="flex justify-between"><span className="text-stone-500">Dept</span><span className="text-stone-300">{editPanel.emp.dept || "—"}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback Toast ─────────────────────────────────────── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-800 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-slideUp font-mono text-xs">
          <span className="text-emerald-400">✓</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}

/* ── Pipeline Results Card ────────────────────────────────────── */

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-stone-400 bg-stone-900 border-stone-800",
  low: "text-blue-400 bg-blue-950/40 border-blue-900",
  medium: "text-amber-400 bg-amber-950/40 border-amber-900",
  high: "text-orange-400 bg-orange-950/40 border-orange-900",
  critical: "text-red-400 bg-red-950/40 border-red-900",
};

const INSIGHT_ICONS: Record<string, string> = {
  discrepancy: "⚠️", opportunity: "💡", risk: "🔴", trend: "📈",
  recommendation: "✅", summary: "📋",
};

function PipelineResultsCard({ result, agentName, onDismiss }: { result: any; agentName: string; onDismiss: () => void }) {
  const insights = result.insights || [];
  const alerts = result.alerts || [];
  const actions = result.actionsTaken || [];
  const processed = result.processedData || {};
  const totalRecords = result.totalRecordsProcessed || 0;
  const executedActions = actions.filter((a: any) => a.status === "executed").length;
  const failedActions = actions.filter((a: any) => a.status === "failed").length;
  const hasData = insights.length > 0 || alerts.length > 0 || actions.length > 0;

  // 0 connections = empty state
  const connectedCount = (result.queryResults || []).filter((r: any) => r.status === "ok").length;
  const isEmpty = connectedCount === 0 && totalRecords === 0;

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-xl p-4 space-y-3 mt-2 animate-slideUp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <span className="text-[11px] font-bold text-white">Run Results</span>
          <span className="text-[10px] text-stone-500 font-mono">
            {totalRecords} record{totalRecords !== 1 ? "s" : ""} · {connectedCount} system{connectedCount !== 1 ? "s" : ""}
          </span>
        </div>
        <button onClick={onDismiss}
          className="text-stone-500 hover:text-stone-300 text-sm leading-none">&times;</button>
      </div>

      {isEmpty ? (
        <div className="text-center py-3 text-stone-500 text-[10px] font-mono">
          🔌 No integrations connected — connect data sources to unlock processing.
        </div>
      ) : !hasData ? (
        <div className="text-center py-3 text-stone-500 text-[10px] font-mono">
          Run complete. No notable findings.
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="flex gap-3 text-[10px] font-mono">
            {insights.length > 0 && (
              <span className="text-stone-400">💡 {insights.length} insight{insights.length !== 1 ? "s" : ""}</span>
            )}
            {alerts.length > 0 && (
              <span className="text-amber-400">🚨 {alerts.length} alert{alerts.length !== 1 ? "s" : ""}</span>
            )}
            {executedActions > 0 && (
              <span className="text-emerald-400">⚡ {executedActions} action{executedActions !== 1 ? "s" : ""}</span>
            )}
            {failedActions > 0 && (
              <span className="text-red-400">❌ {failedActions} failed</span>
            )}
          </div>

          {/* Insights list */}
          {insights.length > 0 && (
            <div className="space-y-1.5">
              <span className="text-[9px] font-mono uppercase text-stone-500 font-bold tracking-wider">Insights</span>
              {insights.slice(0, 5).map((insight: any, i: number) => (
                <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg border text-[10px] ${SEVERITY_COLORS[insight.severity] || SEVERITY_COLORS.info}`}>
                  <span className="shrink-0 mt-0.5">{INSIGHT_ICONS[insight.type] || "•"}</span>
                  <span className="leading-relaxed">{insight.message}</span>
                </div>
              ))}
              {insights.length > 5 && (
                <span className="text-[9px] text-stone-600 font-mono pl-2">+{insights.length - 5} more</span>
              )}
            </div>
          )}

          {/* Actions Taken */}
          {actions.length > 0 && (
            <div className="space-y-1">
              <span className="text-[9px] font-mono uppercase text-stone-500 font-bold tracking-wider">Actions</span>
              {actions.map((a: any, i: number) => (
                <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono ${
                  a.status === "executed" ? "text-emerald-400 bg-emerald-950/20" :
                  a.status === "failed" ? "text-red-400 bg-red-950/20" :
                  "text-stone-500 bg-stone-900"
                }`}>
                  <span>{a.status === "executed" ? "✅" : a.status === "failed" ? "❌" : "⏭"}</span>
                  <span>{a.provider}: {a.detail}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Capability Form ──────────────────────────────────────────── */

function CapabilityForm({ emp, onSave, onCancel }: { emp: any; onSave: (emp: any, updates: Record<string, any>) => void; onCancel: () => void }) {
  const [purpose, setPurpose] = useState(emp.purpose || "");
  const [dept, setDept] = useState(emp.dept || "");

  // Configurable options per agent type
  const [autoPause, setAutoPause] = useState(emp.autoPause !== false);
  const [notifyOnError, setNotifyOnError] = useState(emp.notifyOnError !== false);
  const [maxRetries, setMaxRetries] = useState(emp.maxRetries || 3);
  const [priority, setPriority] = useState(emp.priority || "normal");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(emp, {
      purpose,
      dept,
      autoPause,
      notifyOnError,
      maxRetries,
      priority,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Purpose */}
      <div className="space-y-1">
        <label className="text-[9px] font-mono uppercase text-stone-500 font-bold tracking-wider">Purpose</label>
        <textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={3}
          className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 outline-none focus:border-stone-700 resize-none" />
      </div>

      {/* Department */}
      <div className="space-y-1">
        <label className="text-[9px] font-mono uppercase text-stone-500 font-bold tracking-wider">Department</label>
        <input type="text" value={dept} onChange={e => setDept(e.target.value)}
          className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 outline-none focus:border-stone-700" />
      </div>

      {/* Priority */}
      <div className="space-y-1">
        <label className="text-[9px] font-mono uppercase text-stone-500 font-bold tracking-wider">Priority</label>
        <select value={priority} onChange={e => setPriority(e.target.value)}
          className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 outline-none focus:border-stone-700">
          <option value="low">Low</option>
          <option value="normal">Normal</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
      </div>

      {/* Max Retries */}
      <div className="space-y-1">
        <label className="text-[9px] font-mono uppercase text-stone-500 font-bold tracking-wider">Max Retries</label>
        <input type="number" min={1} max={10} value={maxRetries} onChange={e => setMaxRetries(Number(e.target.value))}
          className="w-full bg-stone-900 border border-stone-800 rounded-lg px-3 py-2 text-xs text-stone-200 outline-none focus:border-stone-700" />
      </div>

      {/* Toggles */}
      <div className="space-y-3">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-[10px] text-stone-400 font-medium">Auto-pause on errors</span>
          <div className={`w-9 h-5 rounded-full transition-colors ${autoPause ? "bg-emerald-600" : "bg-stone-700"} relative`}
            onClick={() => setAutoPause(!autoPause)}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${autoPause ? "left-4" : "left-0.5"}`} />
          </div>
        </label>
        <label className="flex items-center justify-between cursor-pointer">
          <span className="text-[10px] text-stone-400 font-medium">Notify on error</span>
          <div className={`w-9 h-5 rounded-full transition-colors ${notifyOnError ? "bg-emerald-600" : "bg-stone-700"} relative`}
            onClick={() => setNotifyOnError(!notifyOnError)}>
            <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${notifyOnError ? "left-4" : "left-0.5"}`} />
          </div>
        </label>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <button type="submit"
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-lg transition-all">
          Save Capabilities
        </button>
        <button type="button" onClick={onCancel}
          className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs py-2.5 rounded-lg transition-all">
          Cancel
        </button>
      </div>
    </form>
  );
}
