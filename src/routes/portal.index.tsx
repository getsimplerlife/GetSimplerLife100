import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AnimatedNumber } from "~/components/ui";

export const Route = createFileRoute("/portal/")({
  component: ExecutiveDashboard,
});

function ExecutiveDashboard() {
  const [stats, setStats] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState("");

  const fetchDashboardData = async () => {
    try {
      // Fetch stats
      const rStats = await fetch("/api/data/dashboard", { credentials: "include" });
      const dStats = await rStats.json();
      if (dStats.data && dStats.data.length > 0) {
        setStats(dStats.data);
      } else {
        const defaultStats = [
          { name: "Labor Hours Saved", value: "1,120 hrs", change: "+14.2% this week", label: "Estimated manual time saved" },
          { name: "Estimated ROI Saved", value: "$50,400", change: "2.2x implementation cost", label: "Cumulative cost-reduction index" },
          { name: "Task Success Rate", value: "98.7%", change: "Optimal performance", label: "Accuracy across all agents" },
          { name: "Running Co-workers", value: "22 Employees", change: "6 departments", label: "Active autonomous processes" },
        ];
        setStats(defaultStats);
        // Seed
        for (const s of defaultStats) {
          await fetch("/api/data/dashboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(s),
          });
        }
      }

      // Fetch employees
      const rEmp = await fetch("/api/data/employees", { credentials: "include" });
      const dEmp = await rEmp.json();
      setEmployees(dEmp.data || []);

      // Fetch tasks (Activity feed)
      const rTasks = await fetch("/api/data/tasks", { credentials: "include" });
      const dTasks = await rTasks.json();
      setTasks(dTasks.data || []);

      // Fetch approvals
      const rApp = await fetch("/api/data/approvals", { credentials: "include" });
      const dApp = await rApp.json();
      setApprovals(dApp.data || []);

      setLoading(false);
    } catch (err) {
      console.error("Dashboard load failed:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleApprovalAction = async (id: string, action: string) => {
    try {
      setFeedback(`Processing decision: ${action} for request ${id}...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "approval_" + action.toLowerCase(), resource: id }),
      });
      
      // Delete local and DB approval
      const target = approvals.find(a => a.id === id || a._id === id);
      if (target && target._id) {
        await fetch(`/api/data/approvals/${target._id}`, { method: "DELETE", credentials: "include" });
      }
      setApprovals(approvals.filter(a => a.id !== id && a._id !== id));
      setFeedback(`Success: Request ${action}ed`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to process approval action");
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-10 text-stone-100 max-w-6xl mx-auto">
      {/* Good Morning Header Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">AI WORKFORCE ENVIRONMENT ACTIVE</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight leading-none">
          Good Morning, John.
        </h1>
        <p className="text-stone-400 text-sm max-w-2xl leading-relaxed">
          Your active AI workforce completed <span className="text-blue-400 font-bold">842 tasks</span> overnight. Estimated labor hours saved: <span className="text-purple-400 font-bold">47.2 hours</span>.
        </p>
      </div>

      {/* Today's Activity Horizontal Bar */}
      <div className="bg-stone-950 border border-stone-900 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-stone-400">
        <div className="flex items-center gap-3">
          <span className="text-stone-600">📊</span>
          <span className="font-bold text-white uppercase tracking-wider text-[10px]">Today's Activity:</span>
        </div>
        <div className="flex items-center gap-8 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span>842 Tasks Processed</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
            <span>{approvals.length} Approvals Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>98.7% Operational Efficiency</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            <span>0 Fatal Errors</span>
          </div>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s, idx) => (
          <div key={idx} className="bg-stone-950 border border-stone-900 rounded-xl p-6 flex flex-col justify-between hover:border-stone-800 transition-all select-none">
            <div className="space-y-1">
              <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">{s.name}</span>
              <p className="text-2xl font-black text-white"><AnimatedNumber value={s.value} /></p>
            </div>
            <div className="mt-4 pt-4 border-t border-stone-900 space-y-1">
              <span className="text-[10px] text-emerald-400 font-bold block">{s.change}</span>
              <span className="text-[10px] text-stone-500 font-medium block leading-normal">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Grid: AI Employees & Human approvals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left column: AI Workforce (2/3 width on desktop) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Active AI Employees */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="space-y-0.5">
                <h2 className="text-md font-black tracking-tight text-white">🤖 Active AI Employees</h2>
                <p className="text-[11px] text-stone-500">Autonomous co-workers currently operating in your workspace.</p>
              </div>
              <Link to="/portal/employees" className="text-xs font-mono font-bold text-blue-400 hover:text-blue-300">
                Manage Workforce →
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {employees.slice(0, 4).map((emp, idx) => (
                <div key={idx} className="bg-stone-950 border border-stone-900 rounded-xl p-5 hover:border-stone-850 transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold text-white">{emp.name}</h3>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider font-bold ${
                        emp.status === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                        emp.status === "Idle" ? "bg-stone-900 text-stone-400" :
                        "bg-red-950/40 text-red-400 border border-red-900"
                      }`}>
                        <span className={`h-1 w-1 rounded-full ${emp.status === "Active" ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
                        {emp.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400 leading-normal font-medium">{emp.purpose}</p>
                  </div>
                  <div className="pt-3 border-t border-stone-900 flex justify-between items-center text-[10px] font-mono text-stone-500">
                    <span>Performance: {emp.performance}%</span>
                    <span>Ver: {emp.version}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live Activity Feed */}
          <div className="space-y-4">
            <div className="space-y-0.5">
              <h2 className="text-md font-black tracking-tight text-white">⚡ Live Activity Feed</h2>
              <p className="text-[11px] text-stone-500">Real-time trace of autonomous workforce activities.</p>
            </div>

            <div className="bg-stone-950 border border-stone-900 rounded-xl divide-y divide-stone-900 font-mono text-[11px] text-stone-400 overflow-hidden">
              {tasks.slice(0, 5).map((task, idx) => (
                <div key={idx} className="p-4 hover:bg-stone-900/10 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-stone-600 shrink-0">{task.status === "Completed" ? "✓" : "⚡"}</span>
                    <div className="truncate">
                      <span className="font-bold text-white">{task.aiEmployee}</span>
                      <span className="text-stone-500 mx-2">•</span>
                      <span className="text-stone-300">{task.result}</span>
                    </div>
                  </div>
                  <span className="text-stone-600 shrink-0 text-right text-[10px]">{task.timestamp.split(" ")[1] || "Just now"}</span>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right column: Action & Approvals Need Human Review */}
        <div className="space-y-6">
          <div className="space-y-0.5">
            <h2 className="text-md font-black tracking-tight text-white">📥 Action Required</h2>
            <p className="text-[11px] text-stone-500">Escalated decisions requiring immediate human feedback.</p>
          </div>

          {approvals.length === 0 ? (
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-8 text-center space-y-3">
              <div className="text-2xl">🎉</div>
              <p className="text-xs font-bold text-white">All Decisions Clear</p>
              <p className="text-[10px] text-stone-500 max-w-[200px] mx-auto">No exceptions currently require manual intervention.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {approvals.map((app) => (
                <div key={app.id || app._id} className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4 hover:border-stone-850 transition-all">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-stone-500">{app.id || "APP-PENDING"}</span>
                    <span className="text-blue-400 font-bold">{app.confidenceScore}% Confidence</span>
                  </div>
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-black text-white">{app.type}</h3>
                    <p className="text-[11px] text-stone-400 leading-normal font-medium bg-stone-900/30 p-2.5 rounded-lg border border-stone-900">
                      {app.suggestedDecision}
                    </p>
                  </div>
                  {app.comments && (
                    <p className="text-[10px] text-stone-500 italic">"{app.comments}"</p>
                  )}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-stone-900">
                    <button
                      onClick={() => handleApprovalAction(app.id || app._id, "Approve")}
                      className="bg-white hover:bg-stone-100 text-black text-xs font-bold py-2 rounded-lg transition-all"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleApprovalAction(app.id || app._id, "Reject")}
                      className="bg-stone-900 hover:bg-stone-850 text-stone-300 text-xs font-bold py-2 rounded-lg border border-stone-800 transition-all"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-850 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-slideUp font-mono text-xs">
          <span className="text-blue-500">✓</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}
