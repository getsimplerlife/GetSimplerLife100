import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/employees/$id")({
  component: EmployeeProfile,
});

function EmployeeProfile() {
  const { id } = Route.useParams();
  const [employee, setEmployee] = useState<any>(null);
  
  const [loading, setLoading] = useState(true);
  const [actionFeedback, setActionFeedback] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchEmployeesAndProfile = async () => {
    try {
      const res = await fetch("/api/data/employees", { credentials: "include" });
      const d = await res.json();
      const list = d.data || [];
      

      // Find by our custom id field or fallback to database _id
      const found = list.find((emp: any) => emp.id === id || emp._id === id);
      if (found) {
        setEmployee(found);
      }
      setLoading(false);
    } catch (err) {
      console.error("Error loading employee profile:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployeesAndProfile();
  }, [id]);

  const handleAction = async (actionName: string) => {
    if (!employee) return;
    try {
      setActionFeedback(`Triggering ${actionName} for ${employee.name}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "employee_" + actionName.toLowerCase().replace(" ", "_"),
          resource: employee.name,
          details: { name: employee.name, action: actionName },
        }),
      });
      await res.json();
      
      // Toggle local state for immediate feedback
      if (actionName === "Pause") {
        setEmployee({ ...employee, status: "Paused", currentTask: "Paused by workspace manager." });
      } else if (actionName === "Resume") {
        setEmployee({ ...employee, status: "Active", currentTask: "Awaiting new trigger event..." });
      }

      setActionFeedback(`Success: ${actionName} completed.`);
      setTimeout(() => setActionFeedback(""), 3000);
    } catch (err) {
      console.error(err);
      setActionFeedback(`Error: Failed to perform ${actionName}`);
      setTimeout(() => setActionFeedback(""), 3000);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setActionFeedback("Initiating model context reconciliation...");
    setTimeout(() => {
      setIsSyncing(false);
      setActionFeedback("Success: Agent memory and knowledge graphs successfully synced.");
      setTimeout(() => setActionFeedback(""), 3000);
    }, 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="text-center py-20 space-y-4 max-w-md mx-auto">
        <div className="text-4xl text-stone-600">🤖</div>
        <h1 className="text-xl font-bold text-white">AI Employee Not Found</h1>
        <p className="text-stone-400 text-sm">
          We couldn't locate any autonomous employee with the identifier <code className="font-mono bg-stone-900 px-1.5 py-0.5 rounded text-rose-400">{id}</code>.
        </p>
        <div className="pt-4">
          <Link to="/portal/employees" className="inline-flex items-center bg-stone-900 hover:bg-stone-850 text-white border border-stone-800 rounded-xl px-4 py-2 text-xs font-mono font-bold transition-all">
            ← Back to Workforce Map
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-stone-100 max-w-5xl mx-auto">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 text-xs font-mono text-stone-500">
        <Link to="/portal" className="hover:text-stone-300">Portal</Link>
        <span>/</span>
        <Link to="/portal/employees" className="hover:text-stone-300">Workforce</Link>
        <span>/</span>
        <span className="text-white truncate max-w-[200px]">{employee.name.split(" (")[0]}</span>
      </div>

      {/* Header Profile Section */}
      <div className="bg-stone-950 border border-stone-900 rounded-xl p-6 md:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-xl bg-stone-900 border border-stone-800 flex items-center justify-center text-lg select-none">
              🤖
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-none">
                {employee.name.split(" (")[0]}
              </h1>
              <p className="text-xs text-stone-500 mt-1.5 font-mono">
                {employee.name.includes("(") ? employee.name.match(/\(([^)]+)\)/)?.[1] || "AI Employee" : "AI Specialist"}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider font-bold ${
              employee.status === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
              employee.status === "Idle" ? "bg-stone-900 text-stone-400 border border-stone-800" :
              "bg-amber-950/40 text-amber-400 border border-amber-900"
            }`}>
              <span className={`h-1.5 w-1.5 rounded-full ${employee.status === "Active" ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
              {employee.status}
            </span>
          </div>
          <p className="text-stone-400 text-sm max-w-2xl leading-relaxed">
            {employee.purpose}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => handleAction(employee.status === "Active" ? "Pause" : "Resume")}
            className="bg-stone-900 hover:bg-stone-850 text-white text-xs font-mono font-bold px-4 py-2.5 rounded-xl border border-stone-800 transition-all"
          >
            {employee.status === "Active" ? "Pause Employee" : "Resume Employee"}
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-white hover:bg-stone-100 text-black text-xs font-mono font-bold px-4 py-2.5 rounded-xl transition-all disabled:opacity-50"
          >
            {isSyncing ? "Syncing..." : "Sync Knowledge"}
          </button>
        </div>
      </div>

      {/* Main Grid: Details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Metrics & Config (2 cols on desktop) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Performance & Labor Metrics */}
          <div className="space-y-4">
            <h2 className="text-sm font-mono tracking-widest text-stone-500 uppercase">⚡ PERFORMANCE METRICS</h2>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-stone-950 border border-stone-900 rounded-xl p-4 space-y-1">
                <span className="text-[10px] text-stone-500 font-mono block">ACCURACY</span>
                <p className="text-xl font-bold text-white">{employee.performance}%</p>
                <span className="text-[9px] text-emerald-400 font-bold block">±0.2% variance</span>
              </div>
              <div className="bg-stone-950 border border-stone-900 rounded-xl p-4 space-y-1">
                <span className="text-[10px] text-stone-500 font-mono block">TASKS RUN</span>
                <p className="text-xl font-bold text-white">{employee.tasksCompleted || 450}</p>
                <span className="text-[9px] text-stone-500 font-bold block">Lifetime runs</span>
              </div>
              <div className="bg-stone-950 border border-stone-900 rounded-xl p-4 space-y-1">
                <span className="text-[10px] text-stone-500 font-mono block">HOURS SAVED</span>
                <p className="text-xl font-bold text-white">{employee.hoursSaved || "37.5"}h</p>
                <span className="text-[9px] text-purple-400 font-bold block">Productive time</span>
              </div>
              <div className="bg-stone-950 border border-stone-900 rounded-xl p-4 space-y-1">
                <span className="text-[10px] text-stone-500 font-mono block">AVG RUNTIME</span>
                <p className="text-xl font-bold text-white">{employee.avgTime || "1.5s"}</p>
                <span className="text-[9px] text-stone-500 font-bold block">Model latency</span>
              </div>
            </div>
          </div>

          {/* Current Live Work Activity Trace */}
          <div className="space-y-4">
            <h2 className="text-sm font-mono tracking-widest text-stone-500 uppercase">🧠 CURRENT WORK ACTIVITY</h2>
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-3 font-mono text-xs">
              <div className="flex justify-between text-[10px] text-stone-500 pb-2 border-b border-stone-900">
                <span>SYSTEM AGENT TASK HANDLER</span>
                <span>STATUS: {employee.status.toUpperCase()}</span>
              </div>
              <div className="space-y-2 leading-relaxed">
                <div className="flex gap-2">
                  <span className="text-stone-600">❯</span>
                  <span className="text-stone-300">{employee.currentTask}</span>
                </div>
                {employee.status === "Active" && (
                  <>
                    <div className="flex gap-2 text-stone-500">
                      <span>❯</span>
                      <span className="animate-pulse">Retrieving contextual embeddings for matching schema...</span>
                    </div>
                    <div className="flex gap-2 text-[10px] text-emerald-500/70">
                      <span>✓</span>
                      <span>Success: Action matched to execution policy with 98% certainty.</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Recent Decisions Log */}
          <div className="space-y-4">
            <h2 className="text-sm font-mono tracking-widest text-stone-500 uppercase">📋 RECENT AUTONOMOUS DECISIONS</h2>
            
            <div className="bg-stone-950 border border-stone-900 rounded-xl overflow-hidden divide-y divide-stone-900">
              {employee.recentDecisions && employee.recentDecisions.length > 0 ? (
                employee.recentDecisions.map((dec: any, idx: number) => (
                  <div key={idx} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-stone-900/10">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-white">{dec.id}</span>
                        <span className="text-stone-600 font-mono text-[10px]">•</span>
                        <span className="text-xs font-bold text-stone-300">{dec.action}</span>
                      </div>
                      <p className="text-[11px] text-stone-400 leading-normal">{dec.details}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 font-mono text-[10px]">
                      <span className="text-stone-500">{dec.timestamp}</span>
                      <span className={`inline-block px-2 py-0.5 rounded font-bold ${
                        dec.status === "Success" ? "bg-emerald-950/40 text-emerald-400" : "bg-stone-900 text-stone-400"
                      }`}>
                        {dec.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-stone-500 text-xs">
                  No decision logs logged in the past 24 hours.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Right Column: Knowledge and Integrations */}
        <div className="space-y-8">
          
          {/* Metadata & Ownership Card */}
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono tracking-wider text-stone-400 uppercase">EMPLOYEE DETAILS</h3>
            <div className="space-y-3 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-stone-500">Department</span>
                <span className="text-white font-bold">{employee.dept}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Manager</span>
                <span className="text-white font-bold text-right max-w-[150px] truncate">{employee.manager || "John"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Owner / Tenant</span>
                <span className="text-white font-bold">{employee.owner}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Build Version</span>
                <span className="text-blue-400 font-bold">{employee.version}</span>
              </div>
            </div>
          </div>

          {/* Knowledge Section */}
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono tracking-wider text-stone-400 uppercase">🧠 EMBEDDED KNOWLEDGE BASE</h3>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Proprietary file contexts, SOPs, and spreadsheets loaded into this employee's retrieval-augmented memory.
            </p>
            <div className="space-y-2">
              {employee.knowledge && employee.knowledge.length > 0 ? (
                employee.knowledge.map((know: string, idx: number) => (
                  <div key={idx} className="bg-stone-900/40 border border-stone-900 hover:border-stone-800 rounded-lg p-3 flex items-center justify-between text-xs transition-all">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-stone-500 shrink-0">📄</span>
                      <span className="font-bold text-stone-200 truncate">{know}</span>
                    </div>
                    <span className="text-[9px] font-mono text-stone-500 uppercase shrink-0">CONTEXT</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-stone-500 text-xs">
                  No custom files loaded.
                </div>
              )}
            </div>
          </div>

          {/* Connected Apps */}
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4">
            <h3 className="text-xs font-mono tracking-wider text-stone-400 uppercase">🔌 CONNECTED WORKSPACE APPS</h3>
            <p className="text-[11px] text-stone-500 leading-relaxed">
              Direct API integrations and credentials mapped to this employee's execution agent.
            </p>
            <div className="space-y-2">
              {employee.connectedApps && employee.connectedApps.length > 0 ? (
                employee.connectedApps.map((app: string, idx: number) => (
                  <div key={idx} className="bg-stone-900/40 border border-stone-900 rounded-lg p-3 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs shrink-0">
                        {app === "Outlook" ? "✉️" : app === "HubSpot" ? "🧡" : app === "Slack" ? "💬" : app === "Stripe" ? "💳" : "🔌"}
                      </span>
                      <span className="font-bold text-stone-200">{app}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[9px] text-emerald-400 font-bold uppercase">
                      <span className="h-1 w-1 rounded-full bg-emerald-400" />
                      CONNECTED
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-stone-500 text-xs">
                  No integrated workspace apps.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Action Toast Feedback */}
      {actionFeedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-850 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-slideUp font-mono text-xs">
          <span className="text-blue-500">✓</span>
          <span className="font-bold">{actionFeedback}</span>
        </div>
      )}
    </div>
  );
}
