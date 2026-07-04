import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/workflows/")({
  component: WorkflowManager,
});

function WorkflowManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch("/api/data/workflows", { credentials: "include" });
      const d = await res.json();
      setWorkflows(d.data || []);
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleAction = async (id: string, action: string) => {
    try {
      setFeedback("Triggering action " + action + " for Workflow: " + id + "...");
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "workflow_" + action.toLowerCase().replace(" ", "_"),
          resource: id,
          details: { id, action },
        }),
      });
      await res.json();
      setFeedback("Success: " + action + " triggered for Workflow " + id);
      setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      console.error(err);
      setFeedback("Error: Failed to process " + action + " for Workflow " + id);
      setTimeout(() => setFeedback(""), 4000);
    }
  };

  const filteredWorkflows = workflows.filter((wf) => {
    const matchesSearch = wf.name.toLowerCase().includes(searchTerm.toLowerCase()) || wf.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || wf.status.toLowerCase() === statusFilter.toLowerCase();
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
      <div className="border-b border-stone-200 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-stone-900 tracking-tight">⚙️ Workflow Manager</h1>
          <p className="text-stone-500 mt-1">Orchestrate and coordinate automations, review run statistics, and configure alerts.</p>
        </div>
        <button
          onClick={async () => {
            try {
              setFeedback("Initializing new workflow wizard pipeline...");
              await fetch("/api/action", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ action: "create_workflow_init", resource: "workflow_manager" }),
              });
              setFeedback("Success: Custom Workflow configuration workspace open!");
              setTimeout(() => setFeedback(""), 4000);
            } catch (err) {
              console.error(err);
            }
          }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-6 py-3 rounded-2xl shadow-lg flex items-center justify-center gap-2 self-start md:self-auto"
        >
          ➕ Create Custom Workflow
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
        <input
          type="text"
          placeholder="Search workflows by ID or name..."
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
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* Grid of Workflows */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredWorkflows.map((wf) => (
          <div key={wf.id} className="bg-white border border-stone-200 rounded-3xl shadow-sm hover:shadow-lg transition-all p-6 flex flex-col justify-between gap-6">
            <div className="space-y-4">
              {/* Header inside Card */}
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-mono font-bold text-stone-400 bg-stone-100 border border-stone-200 px-2 py-0.5 rounded">
                  {wf.id}
                </span>
                <span className={'inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-1.5 ' + 
                  (wf.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" :
                  wf.status === "Paused" ? "bg-stone-100 text-stone-600 border border-stone-200" :
                  wf.status === "Draft" ? "bg-blue-50 text-blue-700 border border-blue-100" :
                  "bg-rose-50 text-rose-700 border border-rose-100")}>
                  {wf.status}
                </span>
              </div>

              {/* Title & Desc */}
              <div>
                <h3 className="font-black text-stone-900 leading-tight text-sm mb-1.5">{wf.name}</h3>
                <p className="text-stone-500 text-xs leading-relaxed">{wf.description}</p>
              </div>

              {/* Diagram Visual */}
              <div className="bg-stone-50 rounded-2xl border border-dashed border-stone-200 p-4 flex items-center justify-center gap-2 select-none">
                <span className="text-xs font-bold text-stone-400">Trigger</span>
                <span className="text-stone-300">➜</span>
                <span className="text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-lg">AI Employee</span>
                <span className="text-stone-300">➜</span>
                <span className="text-xs font-bold text-stone-400">Action</span>
              </div>

              {/* Dependencies */}
              <div className="space-y-1.5 text-[11px] font-semibold text-stone-500">
                <div className="truncate"><span className="font-bold text-stone-400">Depends:</span> {wf.dependencies}</div>
                <div><span className="font-bold text-stone-400">Last Trigger:</span> {wf.lastTriggered}</div>
              </div>
            </div>

            {/* Bottom Row Metrics & Actions */}
            <div className="border-t border-stone-100 pt-4 flex flex-col gap-4">
              <div className="flex justify-between items-center text-xs">
                <div>
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Success Rate</div>
                  <div className="font-black text-stone-900 text-sm">{wf.successRate}%</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Runtime</div>
                  <div className="font-black text-stone-900 text-sm">{wf.runtime}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Errors (24h)</div>
                  <div className={'font-black text-sm ' + (wf.errors > 0 ? "text-rose-600 animate-pulse" : "text-stone-900")}>{wf.errors}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleAction(wf.id, "Edit")}
                  className="bg-stone-50 hover:bg-stone-100 text-stone-700 text-[10px] font-bold py-2 rounded-xl border border-stone-200"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleAction(wf.id, wf.status === "Active" ? "Pause" : "Resume")}
                  className="bg-stone-50 hover:bg-stone-100 text-stone-700 text-[10px] font-bold py-2 rounded-xl border border-stone-200"
                >
                  {wf.status === "Active" ? "Pause" : "Resume"}
                </button>
                <button
                  onClick={() => handleAction(wf.id, "Test")}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-bold py-2 rounded-xl border border-emerald-100"
                >
                  Run Test
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}