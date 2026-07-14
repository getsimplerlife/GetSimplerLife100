import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/employees/")({
  component: EmployeesManager,
});

interface Employee {
  id: string;
  name: string;
  purpose: string;
  dept: string;
  status: string;
  version: string;
  currentTask: string;
  performance: number;
  successRate: number;
  avgTime: string;
  owner: string;
}

function EmployeesManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = async () => {
    try {
      // Fetch both data sources in parallel
      const [dataRes, agentRes] = await Promise.all([
        fetch("/api/data/employees", { credentials: "include" }),
        fetch("/api/agents/list", { credentials: "include" }),
      ]);

      // Build employee map from the flat data section
      const employeeMap = new Map<string, Employee>();
      if (dataRes.ok) {
        const d = await dataRes.json();
        if (d.data && d.data.length > 0) {
          for (const row of d.data) {
            const emp: Employee = {
              id: row.id || row._id || row.agentId || "",
              name: row.name || "Unknown",
              purpose: row.purpose || "No description",
              dept: row.dept || row.category || "General",
              status: row.status || "Idle",
              version: row.version || "1.0.0",
              currentTask: row.currentTask || "Awaiting instructions",
              performance: row.performance || 98,
              successRate: row.successRate || 98,
              avgTime: row.avgTime || "<1s",
              owner: row.owner || row.userId || "",
            };
            if (emp.id) employeeMap.set(emp.id, emp);
          }
        }
      }

      // Merge in real agent instances from the runtime
      if (agentRes.ok) {
        const agentData = await agentRes.json();
        if (agentData.success && agentData.agents) {
          for (const agent of agentData.agents) {
            const agentId = agent.id;
            const existing = employeeMap.get(agentId);
            const agentStatus = agent.status === "running" ? "Active" :
                                agent.status === "paused" ? "Paused" : "Idle";

            if (existing) {
              // Update status from real agent runtime
              existing.status = agentStatus;
              employeeMap.set(agentId, existing);
            } else {
              // Create entry from agent instance
              employeeMap.set(agentId, {
                id: agentId,
                name: agent.name || "AI Employee",
                purpose: agent.description || "No description available",
                dept: agent.agentType || "General",
                status: agentStatus,
                version: "1.0.0",
                currentTask: "Awaiting instructions",
                performance: 95,
                successRate: 95,
                avgTime: "<1s",
                owner: agent.userId || "",
              });
            }
          }
        }
      }

      setEmployees(Array.from(employeeMap.values()));
      setLoading(false);
    } catch (err) {
      console.error("Error loading employees:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleAction = async (empName: string, actionName: string) => {
    try {
      setFeedback(`Processing action "${actionName}" for ${empName}...`);

      // Find the employee to get their agent ID
      const emp = employees.find(e => e.name === empName);

      if (emp && emp.id) {
        // Call proper agent runtime API for pause/resume
        if (actionName === "Pause") {
          const res = await fetch(`/api/agents/${emp.id}/pause`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          if (!res.ok) throw new Error("Pause request failed");
        } else if (actionName === "Resume") {
          const res = await fetch(`/api/agents/${emp.id}/resume`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          });
          if (!res.ok) throw new Error("Resume request failed");
        }
      }

      // Also log audit
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "employee_" + actionName.toLowerCase().replace(" ", "_"),
          resource: empName,
          details: { name: empName, action: actionName },
        }),
      });

      // Update local state
      setEmployees(prev =>
        prev.map(e => {
          if (e.name === empName) {
            if (actionName === "Pause") return { ...e, status: "Paused" };
            if (actionName === "Resume") return { ...e, status: "Active" };
          }
          return e;
        })
      );

      setFeedback(`Success: ${actionName} processed for ${empName}`);
      setTimeout(() => setFeedback(""), 3000);
    } catch (err) {
      console.error(err);
      setFeedback(`Error: Failed to process ${actionName} for ${empName}`);
      setTimeout(() => setFeedback(""), 3000);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.purpose.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          emp.dept.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || emp.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });


  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
        <p className="text-xs font-mono text-stone-500">
          Loading active workforce context...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-10 text-stone-100 max-w-6xl mx-auto">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">AI WORKFORCE SYSTEM ACTIVE</span>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight leading-none">🤖 AI Employee Directory</h1>
        <p className="text-stone-400 text-sm max-w-2xl leading-relaxed">
          Monitor operational statuses, review embedded knowledge bases, and configure trigger-execution policies for your specialized coworkers.
        </p>
      </div>

      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-8 py-16 bg-stone-950 border border-stone-900 rounded-2xl max-w-xl mx-auto my-8">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-lg font-bold text-white mb-2">No AI employees deployed yet</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm leading-relaxed">
            Purchase an AI employee build to automate your high-friction workflows and scale your business.
          </p>
          <Link
            to="/portal/marketplace"
            className="inline-flex items-center justify-center bg-white hover:bg-stone-100 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg shadow-white/5 active:scale-95"
          >
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <>
          {/* ─── AI WORKFORCE HIERARCHY MAP ─── */}
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-sm font-mono tracking-widest text-stone-500 uppercase">⚡ PIPELINE WORKFORCE MAP</h2>
              <p className="text-xs text-stone-600">Click any employee node below to review full cognitive profiles, knowledge bases, and decision histories.</p>
            </div>

            <div className="bg-stone-950 border border-stone-900 rounded-xl p-6 overflow-x-auto select-none relative">

              {/* Main SVG connecting line */}
              <div className="min-w-[900px] flex items-center justify-between py-6 relative">

                {/* SVG Connecting Dotted Lines with pulse effect */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 z-0 overflow-hidden">
                  <svg className="w-full h-2" fill="none">
                    <line
                      x1="0" y1="4" x2="100%" y2="4"
                      stroke="#292524" strokeWidth="2" strokeDasharray="6 6"
                    />
                    <line
                      x1="0" y1="4" x2="100%" y2="4"
                      stroke="#10b981" strokeWidth="2" strokeDasharray="6 40"
                      className="animate-pulse"
                    />
                  </svg>
                </div>

                {/* Sales Intake Trigger Node */}
                <div className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0">
                  <div className="h-10 w-10 rounded-full bg-stone-900 border-2 border-stone-800 flex items-center justify-center text-xs font-mono font-bold text-stone-500 shadow-lg">
                    📥
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="text-[10px] font-mono font-bold text-stone-400">SALES INTAKE</p>
                    <p className="text-[9px] text-stone-600 font-medium">Inbound Emails / RFPs</p>
                  </div>
                </div>

                {/* Dynamic employee nodes from deployed agents */}
                {employees.slice(0, 5).map((emp) => (
                  <Link
                    key={emp.id}
                    to="/portal/employees/$id"
                    params={{ id: emp.id }}
                    className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0 group transition-all"
                  >
                    <div className={`h-12 w-12 rounded-xl bg-stone-950 border-2 flex items-center justify-center relative shadow-xl transition-all duration-300 ${
                      emp.status === "Active" ? "border-emerald-900 group-hover:border-emerald-500" : "border-stone-800 group-hover:border-stone-500"
                    }`}>
                      <span className="text-lg">🤖</span>
                      {emp.status === "Active" && (
                        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse border border-stone-950" />
                      )}
                    </div>
                    <div className="text-center space-y-0.5">
                      <p className="text-[11px] font-bold text-stone-200 group-hover:text-emerald-400 transition-colors truncate max-w-[120px]">{emp.name}</p>
                      <p className="text-[9px] font-mono text-stone-500 uppercase tracking-widest truncate max-w-[120px]">{emp.dept}</p>
                    </div>
                  </Link>
                ))}

                {/* ERP/Accounting Output Node */}
                <div className="flex flex-col items-center space-y-2.5 z-10 w-40 shrink-0">
                  <div className="h-10 w-10 rounded-full bg-stone-900 border-2 border-stone-800 flex items-center justify-center text-xs font-mono font-bold text-stone-500 shadow-lg">
                    🏛️
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="text-[10px] font-mono font-bold text-stone-400">LEDGER SYNC</p>
                    <p className="text-[9px] text-stone-600 font-medium">QuickBooks / SAP</p>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row gap-4 bg-stone-950 p-4 rounded-xl border border-stone-900">
            <input
              type="text"
              placeholder="Search AI coworkers by name, department, or description..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 bg-stone-900/40 border border-stone-900 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-800 font-medium placeholder-stone-600 text-stone-200"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-stone-900/40 border border-stone-900 rounded-lg px-4 py-2.5 text-xs outline-none focus:border-stone-800 font-bold text-stone-400"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="idle">Idle</option>
              <option value="paused">Paused</option>
            </select>
          </div>

          {/* Main Table Container */}
          <div className="bg-stone-950 border border-stone-900 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-medium">
                <thead>
                  <tr className="border-b border-stone-900 text-stone-500 uppercase font-mono tracking-wider text-[10px]">
                    <th className="p-4 pl-6">COWORKER IDENTIFICATION</th>
                    <th className="p-4">DEPARTMENT & PURPOSE</th>
                    <th className="p-4">STATUS & BUILD</th>
                    <th className="p-4">CURRENT OPERATING TASK</th>
                    <th className="p-4">ACCURACY PROFILE</th>
                    <th className="p-4 text-right pr-6">CONTROL ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-900">
                  {filteredEmployees.map((emp, _idx) => (
                    <tr key={emp.id || idx} className="hover:bg-stone-900/10 transition-colors">
                      {/* Name & Owner */}
                      <td className="p-4 pl-6">
                        <Link to="/portal/employees/$id" params={{ id: emp.id }} className="font-bold text-white hover:text-blue-400 block transition-colors">
                          {emp.name.split(" (")[0]}
                        </Link>
                        <span className="text-[10px] text-stone-500 font-mono">ID: {emp.id.slice(0, 8)}...</span>
                      </td>
                      {/* Purpose & Dept */}
                      <td className="p-4 max-w-xs leading-normal font-normal">
                        <span className="text-[9px] font-mono font-bold uppercase bg-stone-900 text-stone-400 px-1.5 py-0.5 rounded border border-stone-850 block w-max mb-1.5">
                          {emp.dept}
                        </span>
                        <div className="text-stone-400 font-medium line-clamp-2">{emp.purpose}</div>
                      </td>
                      {/* Status & Version */}
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider font-bold mb-1.5 ${
                          emp.status === "Active" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900" :
                          emp.status === "Idle" ? "bg-stone-900 text-stone-400 border border-stone-850" :
                          "bg-stone-900/40 text-stone-500 border border-stone-900"
                        }`}>
                          <span className={`h-1 w-1 rounded-full ${emp.status === "Active" ? "bg-emerald-400 animate-pulse" : "bg-stone-500"}`} />
                          {emp.status}
                        </span>
                        <div className="text-[10px] text-stone-500 font-mono block">Ver: {emp.version}</div>
                      </td>
                      {/* Current Task */}
                      <td className="p-4 text-stone-400 font-medium max-w-xs truncate">{emp.currentTask}</td>
                      {/* Performance */}
                      <td className="p-4">
                        <div className="space-y-1.5 w-32">
                          <div className="w-full bg-stone-900 rounded-full h-1 overflow-hidden">
                            <div className="bg-emerald-500 h-full" style={{ width: `${emp.successRate || 100}%` }} />
                          </div>
                          <div className="text-[10px] text-stone-500 font-mono">
                            Acc: {emp.performance}% • {emp.avgTime || "1s"}
                          </div>
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="p-4 text-right pr-6">
                        <div className="flex justify-end gap-1.5 font-mono text-[10px]">
                          <button
                            onClick={() => handleAction(emp.name, emp.status === "Active" ? "Pause" : "Resume")}
                            className="bg-stone-900 hover:bg-stone-850 text-white font-bold px-2.5 py-1.5 rounded-lg border border-stone-800 transition-all"
                          >
                            {emp.status === "Active" ? "Pause" : "Resume"}
                          </button>
                          <Link
                            to="/portal/employees/$id"
                            params={{ id: emp.id }}
                            className="bg-white hover:bg-stone-100 text-black font-bold px-2.5 py-1.5 rounded-lg transition-all"
                          >
                            Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-stone-500 font-mono text-xs">
                        No autonomous coworkers match the filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-850 text-white px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-slideUp font-mono text-xs">
          <span className="text-blue-500">✓</span>
          <span className="font-bold">{feedback}</span>
        </div>
      )}
    </div>
  );
}