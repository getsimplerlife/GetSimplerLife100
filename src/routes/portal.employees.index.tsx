import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/employees/")({
  component: EmployeesManager,
});

function EmployeesManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEmployees = async () => {
    try {
      const res = await fetch("/api/data/employees", { credentials: "include" });
      const d = await res.json();
      setEmployees(d.data || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleAction = async (name: string, action: string) => {
    try {
      setFeedback(`Processing action "${action}" for ${name}...`);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "employee_" + action.toLowerCase().replace(" ", "_"),
          resource: name,
          details: { name, action },
        }),
      });
      const data = await res.json();
      setFeedback(`Success: ${action} processed for ${name}`);
      setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      console.error(err);
      setFeedback(`Error: Failed to process ${action} for ${name}`);
      setTimeout(() => setFeedback(""), 4000);
    }
  };

  const filteredEmployees = employees.filter((emp) => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) || emp.purpose.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || emp.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-stone-200 pb-6">
        <h1 className="text-3xl font-black text-stone-900 tracking-tight">🤖 AI Employee Management</h1>
        <p className="text-stone-500 mt-1">Deploy, monitor, pause, and configure your specialized autonomous coworkers.</p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <input
          type="text"
          placeholder="Search AI employees by name or purpose..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-semibold placeholder-stone-400"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-stone-700"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="paused">Paused</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-semibold">
            <thead>
              <tr className="bg-stone-50 text-stone-500 font-bold border-b border-stone-150 uppercase tracking-wider">
                <th className="p-4">Employee Details</th>
                <th className="p-4">Department & Purpose</th>
                <th className="p-4">Status & Version</th>
                <th className="p-4">Current Task</th>
                <th className="p-4">Performance Metrics</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredEmployees.map((emp, idx) => (
                <tr key={idx} className="hover:bg-stone-50/40">
                  {/* Name & Owner */}
                  <td className="p-4">
                    <div className="font-black text-stone-900 text-sm mb-1">{emp.name}</div>
                    <div className="text-[10px] text-stone-400 font-bold">Owner: {emp.owner}</div>
                  </td>
                  {/* Purpose & Dept */}
                  <td className="p-4 max-w-xs">
                    <span className="text-[10px] font-black uppercase bg-stone-100 text-stone-600 px-2 py-0.5 rounded border border-stone-200 block w-max mb-1">
                      {emp.dept}
                    </span>
                    <div className="text-stone-500 leading-relaxed text-xs">{emp.purpose}</div>
                  </td>
                  {/* Status & Version */}
                  <td className="p-4">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                      emp.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                      emp.status === "Idle" ? "bg-stone-100 text-stone-600 border border-stone-200" :
                      emp.status === "Paused" ? "bg-stone-50 text-stone-500 border border-stone-200" :
                      "bg-rose-50 text-rose-700 border border-rose-100"
                    }`}>
                      {emp.status}
                    </span>
                    <div className="text-[10px] text-stone-400 font-bold">Ver: {emp.version}</div>
                  </td>
                  {/* Current Task */}
                  <td className="p-4 text-stone-600">{emp.currentTask}</td>
                  {/* Performance */}
                  <td className="p-4">
                    <div className="space-y-1">
                      <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                        <div className="bg-emerald-500 h-full" style={{ width: `${emp.successRate}%` }} />
                      </div>
                      <div className="text-[10px] text-stone-400">Avg Run: {emp.avgTime || "N/A"} • Accuracy: {emp.performance}%</div>
                    </div>
                  </td>
                  {/* Actions */}
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => handleAction(emp.name, emp.status === "Active" ? "Pause" : "Resume")}
                        className="bg-stone-50 hover:bg-stone-100 text-stone-700 text-[10px] font-bold px-2 py-1 rounded border border-stone-200"
                      >
                        {emp.status === "Active" ? "Pause" : "Resume"}
                      </button>
                      <button
                        onClick={() => handleAction(emp.name, "Configure")}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded border border-emerald-100"
                      >
                        Configure
                      </button>
                      <button
                        onClick={() => handleAction(emp.name, "View Logs")}
                        className="bg-stone-900 hover:bg-stone-850 text-white text-[10px] font-bold px-2 py-1 rounded"
                      >
                        Logs
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      ${feedbackToast}
    </div>
  );
}