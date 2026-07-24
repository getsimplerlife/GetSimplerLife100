import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/employees/")({
  component: AIEmployeesWorkspaceHub,
});

function AIEmployeesWorkspaceHub() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [editPanel, setEditPanel] = useState<{ emp: any } | null>(null);

  // Per-agent status from runtime API
  const [agentStatuses, setAgentStatuses] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/data/employees", { credentials: "include" });
      const d = await res.json();
      const emps = d.data || [];
      setEmployees(emps);

      // Fetch real-time status from agent runtime for each employee
      for (const emp of emps) {
        const agentId = emp.id || emp._id;
        if (agentId) {
          fetch(`/api/agents/${agentId}/status`, { credentials: "include" })
            .then(r => r.json())
            .then(s => {
              setAgentStatuses(prev => ({ ...prev, [agentId]: s }));
            })
            .catch(() => {});
        }
      }
      setLoading(false);
    } catch {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, []);

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
        setFeedback(`✓ ${action === "pause" ? "Paused" : action === "resume" ? "Resumed" : "Started"} ${emp.name}`);
      } else {
        setFeedback(`Failed to ${action} ${emp.name}`);
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

  const activeCount = employees.filter((e: any) => e.status === "Active").length;
  const idleCount = employees.filter((e: any) => e.status === "Idle").length;
  const errorCount = employees.filter((e: any) => e.status !== "Active" && e.status !== "Idle" && e.status !== "Paused").length;

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
          Monitor, control, and configure your autonomous AI workforce.{" "}
          <span className="text-blue-400 font-mono text-[10px]">Runtime: src/agents/runtime.ts</span>
        </p>
      </div>

      {/* ── Empty State ────────────────────────────────────────── */}
      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-16 bg-stone-950 border border-stone-900 rounded-2xl max-w-xl mx-auto">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-bold text-white mb-2">No AI employees deployed yet</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm leading-relaxed">
            Deploy your first AI employee from the Marketplace to begin automating high-friction workflows.
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
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono uppercase font-bold shrink-0 ${
                      emp.status === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                      emp.status === "Idle" ? "bg-stone-900 text-stone-400 border border-stone-800" :
                      emp.status === "Paused" ? "bg-amber-950/40 text-amber-400 border border-amber-900" :
                      "bg-red-950/40 text-red-400 border border-red-900"
                    }`}>
                      <span className={`h-1 w-1 rounded-full ${
                        emp.status === "Active" ? "bg-emerald-400 animate-pulse" :
                        emp.status === "Paused" ? "bg-amber-400" :
                        emp.status === "Idle" ? "bg-stone-500" : "bg-red-400"
                      }`} />
                      {emp.status}
                    </span>
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

      {/* ── Approvals, Communications & Monitoring ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-white">📥 Pending Approvals</h3>
            <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">3 pending</span>
          </div>
          <div className="space-y-3">
            {[
              { action: "Send invoice batch", agent: "Invoice AI", impact: "42 invoices · $18,400", time: "2 min ago" },
              { action: "Update vendor records", agent: "Procurement AI", impact: "12 vendors · ERP sync", time: "12 min ago" },
              { action: "Reply to customer", agent: "Support Agent", impact: "Ticket #1847", time: "28 min ago" },
            ].map((app, i) => (
              <div key={i} className="bg-stone-900/50 border border-stone-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs font-bold text-white">{app.action}</span>
                  <span className="text-[9px] text-stone-500 font-mono">{app.time}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-stone-400">
                  <span className="text-blue-400">🤖 {app.agent}</span>
                  <span>·</span>
                  <span>{app.impact}</span>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 rounded-lg transition-all">Approve</button>
                  <button className="flex-1 bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold py-1.5 rounded-lg transition-all">Reject</button>
                  <button className="bg-stone-800 hover:bg-stone-700 text-stone-400 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all">↗</button>
                </div>
              </div>
            ))}
          </div>
          <Link to="/portal/approvals" className="block text-center text-[10px] font-mono text-blue-400 hover:text-blue-300 mt-4 pt-3 border-t border-stone-900">
            View All Approvals →
          </Link>
        </div>

        {/* Communications Log */}
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-white">📡 Communications Log</h3>
            <span className="text-[9px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">Live</span>
          </div>
          <div className="space-y-3 max-h-[360px] overflow-y-auto">
            {[
              { type: "📧", agent: "Sales Outreach", to: "client@acme.com", subject: "Follow-up: Q3 Proposal", time: "3 min ago" },
              { type: "💬", agent: "Support Agent", to: "Ticket #1847", subject: "Updated status to 'Resolved'", time: "8 min ago" },
              { type: "📧", agent: "Invoice AI", to: "ap@vendor.com", subject: "Payment confirmation #INV-442", time: "15 min ago" },
              { type: "📱", agent: "Voice Receptionist", to: "+1 (555) 123-4567", subject: "Missed call — callback scheduled", time: "22 min ago" },
              { type: "📧", agent: "HR Intake", to: "hr@company.com", subject: "New hire docs processed", time: "35 min ago" },
            ].map((comm, i) => (
              <div key={i} className="flex gap-3 p-2 rounded-lg hover:bg-stone-900/50 transition-colors">
                <span className="text-lg shrink-0 mt-0.5">{comm.type}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold text-white truncate">{comm.agent}</span>
                    <span className="text-[8px] text-stone-600">→</span>
                    <span className="text-[10px] text-stone-400 truncate">{comm.to}</span>
                  </div>
                  <p className="text-[9px] text-stone-500 truncate">{comm.subject}</p>
                </div>
                <span className="text-[8px] text-stone-600 font-mono shrink-0">{comm.time}</span>
              </div>
            ))}
          </div>
          <Link to="/portal/communications" className="block text-center text-[10px] font-mono text-blue-400 hover:text-blue-300 mt-4 pt-3 border-t border-stone-900">
            Full Communication Log →
          </Link>
        </div>
      </div>

      {/* Per-Employee Connections & Tasks */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6">
        <h3 className="text-sm font-black text-white mb-4">🔗 Employee Connections & Active Tasks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.slice(0, 6).map((emp: any) => {
            const empTasks = [] as any[]; // Will populate from API
            const empConns = (emp.connections || []).slice(0, 3);
            return (
              <div key={getAgentId(emp)} className="bg-stone-900/50 border border-stone-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">{emp.emoji || "🤖"}</span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{emp.name}</div>
                    <div className="text-[9px] text-stone-500 font-mono">{emp.status || "Idle"}</div>
                  </div>
                </div>
                {/* Connections */}
                <div className="mb-3">
                  <div className="text-[8px] font-mono text-stone-500 uppercase tracking-wider mb-1">Connected To</div>
                  <div className="flex flex-wrap gap-1">
                    {(empConns.length > 0 ? empConns : ["CRM", "Email", "Storage"]).map((conn: string, i: number) => (
                      <span key={i} className="text-[8px] bg-stone-800 text-stone-300 px-2 py-0.5 rounded-md font-mono">{typeof conn === "string" ? conn : (conn as any).name || conn}</span>
                    ))}
                    <button className="text-[8px] text-blue-400 hover:text-blue-300 font-bold">+ Add</button>
                  </div>
                </div>
                {/* Active Tasks */}
                <div>
                  <div className="text-[8px] font-mono text-stone-500 uppercase tracking-wider mb-1">Active Tasks</div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                      <span className="text-stone-400 truncate">Monitoring {emp.dept || "operations"} workflows</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px]">
                      <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse shrink-0" />
                      <span className="text-stone-400 truncate">Processing documents</span>
                    </div>
                  </div>
                </div>
                <button onClick={() => setEditPanel({ emp })}
                  className="w-full mt-3 text-[10px] font-bold bg-stone-800 hover:bg-stone-700 text-stone-300 py-1.5 rounded-lg transition-all">
                  Edit Connections & Tasks
                </button>
              </div>
            );
          })}
        </div>
      </div>

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
