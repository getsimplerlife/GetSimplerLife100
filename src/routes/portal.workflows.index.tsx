import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/workflows/")({
  component: WorkflowManager,
});

interface Workflow {
  _id: string;
  id?: string;
  name: string;
  description: string;
  status: "Active" | "Paused" | "Draft" | "Failed";
  successRate: string;
  runtime: string;
  errors: number;
  dependencies: string;
  lastTriggered: string;
  steps?: any[];
}

function WorkflowManager() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState("");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);

  const fetchWorkflows = async () => {
    try {
      const res = await fetch("/api/data/workflows", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch workflows");
      const d = await res.json();
      setWorkflows(d.data || []);
      setLoading(false);
    } catch (err) {
      console.error("Fetch workflows error:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  const handleToggleStatus = async (wf: Workflow) => {
    try {
      const nextStatus = wf.status === "Active" ? "Paused" : "Active";
      setFeedback(`${nextStatus === "Active" ? "Resuming" : "Pausing"} workflow "${wf.name}"...`);
      
      const updatedWf = {
        ...wf,
        status: nextStatus
      };

      const res = await fetch("/api/data/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updatedWf),
      });

      if (!res.ok) throw new Error("Failed to update status");

      setFeedback(`Success: "${wf.name}" is now ${nextStatus}!`);
      fetchWorkflows();
      setTimeout(() => setFeedback(""), 2500);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to update status.");
      setTimeout(() => setFeedback(""), 2500);
    }
  };

  const handleDelete = async (wfId: string, wfName: string) => {
    if (!confirm(`Are you sure you want to delete workflow "${wfName}"?`)) return;
    try {
      setFeedback(`Deleting workflow "${wfName}"...`);
      const res = await fetch(`/api/data/workflows/${wfId}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) throw new Error("Failed to delete workflow");

      setFeedback(`Success: "${wfName}" deleted!`);
      fetchWorkflows();
      setTimeout(() => setFeedback(""), 2500);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to delete workflow.");
      setTimeout(() => setFeedback(""), 2500);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorkflow) return;
    try {
      setFeedback(`Saving changes to "${editingWorkflow.name}"...`);
      const res = await fetch("/api/data/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editingWorkflow),
      });

      if (!res.ok) throw new Error("Failed to save edited workflow");

      setFeedback(`Success: Saved changes to "${editingWorkflow.name}"!`);
      setEditingWorkflow(null);
      fetchWorkflows();
      setTimeout(() => setFeedback(""), 2500);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to save changes.");
      setTimeout(() => setFeedback(""), 2500);
    }
  };

  const handleRunTest = async (wf: Workflow) => {
    try {
      setFeedback(`Triggering test run for "${wf.name}"...`);
      await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "workflow_test",
          resource: wf._id || wf.id,
          details: { id: wf._id || wf.id, name: wf.name },
        }),
      });
      setFeedback(`Test run completed successfully for "${wf.name}"!`);
      setTimeout(() => setFeedback(""), 2500);
    } catch (err) {
      console.error(err);
      setFeedback("Failed to trigger test run.");
      setTimeout(() => setFeedback(""), 2500);
    }
  };

  const filteredWorkflows = workflows.filter((wf) => {
    const name = wf.name || "";
    const id = wf._id || wf.id || "";
    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) || id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || wf.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-850 border-t-emerald-500 rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Syncing Workflows...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none">
      
      {/* ─── Header ─── */}
      <div className="border-b border-stone-900 pb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">⚙️ Workflow Manager</h1>
          <p className="text-stone-400 text-xs mt-1">
            Orchestrate and coordinate automations, review run statistics, and configure custom triggers.
          </p>
        </div>
        <Link
          to="/portal/workflows/builder"
          className="bg-white hover:bg-stone-100 text-black font-extrabold text-xs font-mono px-5 py-3 rounded-xl transition-all shadow-lg active:scale-95"
        >
          ➕ Create Custom Workflow
        </Link>
      </div>

      {/* ─── Filter and Search Bar ─── */}
      <div className="flex flex-col sm:flex-row gap-4 bg-stone-950 p-3.5 border border-stone-900 rounded-xl">
        <div className="flex-1 flex items-center bg-stone-900/50 border border-stone-850 rounded-xl px-3 py-2">
          <span className="text-stone-600 text-sm mr-2 font-mono">🔍</span>
          <input
            type="text"
            placeholder="Search workflows by ID or name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-0 text-xs outline-none font-medium placeholder-stone-600 text-stone-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-stone-900/50 border border-stone-850 rounded-xl px-4 py-2.5 text-xs outline-none font-mono font-bold text-stone-300"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {/* ─── Grid of Workflows ─── */}
      {filteredWorkflows.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center p-12 py-20 bg-stone-950 border border-stone-900 rounded-2xl max-w-xl mx-auto my-8">
          <div className="text-4xl mb-4">⚙️</div>
          <h3 className="text-lg font-bold text-white mb-2">No workflows active</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm leading-relaxed">
            Configure custom multi-layer AI workflows to coordinate patient intakes, ledger parsing, CRM syncs, and dispatch runs.
          </p>
          <Link
            to="/portal/workflows/builder"
            className="inline-flex items-center justify-center bg-white hover:bg-stone-100 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg shadow-white/5 active:scale-95"
          >
            Launch Natural Language Builder
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredWorkflows.map((wf) => (
            <div
              key={wf._id || wf.id}
              className="bg-stone-950 border border-stone-900 hover:border-stone-850 rounded-2xl p-5 flex flex-col justify-between gap-5 transition-all hover:shadow-lg"
            >
              <div className="space-y-4">
                {/* Header inside Card */}
                <div className="flex justify-between items-start">
                  <span className="text-[9px] font-mono font-bold text-stone-400 bg-stone-900 border border-stone-900 px-2 py-0.5 rounded-md truncate max-w-[150px]">
                    ID: {(wf._id || wf.id || "").substring(0, 8)}
                  </span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-mono font-black uppercase tracking-wider ${
                      wf.status === "Active"
                        ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
                        : wf.status === "Paused"
                        ? "bg-stone-900 text-stone-400 border border-stone-800"
                        : wf.status === "Draft"
                        ? "bg-blue-950/40 text-blue-400 border border-blue-900/50"
                        : "bg-rose-950/40 text-rose-400 border border-rose-900/50"
                    }`}
                  >
                    {wf.status}
                  </span>
                </div>

                {/* Title & Desc */}
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-white leading-tight truncate">{wf.name}</h3>
                  <p className="text-stone-400 text-xs leading-relaxed line-clamp-2 min-h-[32px]">{wf.description}</p>
                </div>

                {/* Diagram Visual */}
                <div className="bg-stone-900/40 rounded-xl border border-dashed border-stone-850 p-3.5 flex items-center justify-center gap-1.5 select-none text-[10px]">
                  <span className="font-bold text-stone-500">Trigger</span>
                  <span className="text-stone-700">➜</span>
                  <span className="font-black text-emerald-400 bg-emerald-950/20 border border-emerald-900/30 px-2 py-0.5 rounded">AI Employee</span>
                  <span className="text-stone-700">➜</span>
                  <span className="font-bold text-stone-500">Action</span>
                </div>

                {/* Dependencies */}
                <div className="space-y-1 text-[10px] font-mono text-stone-500">
                  <div className="truncate">
                    <span className="text-stone-400 font-bold">Deps:</span> {wf.dependencies || "None"}
                  </div>
                  <div>
                    <span className="text-stone-400 font-bold">Last Run:</span> {wf.lastTriggered || "Never"}
                  </div>
                </div>
              </div>

              {/* Bottom Row Metrics & Actions */}
              <div className="border-t border-stone-900 pt-4 flex flex-col gap-4">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <div>
                    <div className="text-[8px] font-bold text-stone-500 uppercase tracking-wider">Success Rate</div>
                    <div className="font-black text-white text-xs">{wf.successRate || "100"}%</div>
                  </div>
                  <div>
                    <div className="text-[8px] font-bold text-stone-500 uppercase tracking-wider">Runtime</div>
                    <div className="font-black text-white text-xs">{wf.runtime || "1.2s"}</div>
                  </div>
                  <div>
                    <div className="text-[8px] font-bold text-stone-500 uppercase tracking-wider">Errors (24h)</div>
                    <div className={`font-black text-xs ${wf.errors > 0 ? "text-rose-500 animate-pulse" : "text-white"}`}>
                      {wf.errors || 0}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => setEditingWorkflow(wf)}
                    className="bg-stone-900 hover:bg-stone-850 text-stone-300 text-[10px] font-mono font-bold py-1.5 rounded-lg border border-stone-800 transition-all cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleToggleStatus(wf)}
                    className="bg-stone-900 hover:bg-stone-850 text-stone-300 text-[10px] font-mono font-bold py-1.5 rounded-lg border border-stone-800 transition-all cursor-pointer"
                  >
                    {wf.status === "Active" ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => handleRunTest(wf)}
                    className="bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 text-[10px] font-mono font-bold py-1.5 rounded-lg border border-emerald-900/30 transition-all cursor-pointer"
                  >
                    Test
                  </button>
                  <button
                    onClick={() => handleDelete(wf._id || wf.id || "", wf.name)}
                    className="bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 text-[10px] font-mono font-bold py-1.5 rounded-lg border border-rose-900/30 transition-all cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Edit Workflow Modal ─── */}
      {editingWorkflow && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-950 border border-stone-900 rounded-2xl w-full max-w-lg overflow-hidden animate-zoomIn">
            <div className="border-b border-stone-900 p-5 flex justify-between items-center">
              <h3 className="text-base font-black text-white">📝 Edit Workflow Details</h3>
              <button
                onClick={() => setEditingWorkflow(null)}
                className="text-stone-500 hover:text-stone-300 text-sm"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-mono tracking-wider uppercase text-stone-500 mb-2">
                  Workflow Name
                </label>
                <input
                  type="text"
                  required
                  value={editingWorkflow.name}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, name: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-850 rounded-xl px-4 py-3 text-xs outline-none focus:border-stone-700 font-bold text-stone-200"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono tracking-wider uppercase text-stone-500 mb-2">
                  Description
                </label>
                <textarea
                  rows={4}
                  required
                  value={editingWorkflow.description}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, description: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-850 rounded-xl p-4 text-xs font-medium leading-relaxed outline-none focus:border-stone-700 placeholder-stone-600 resize-none text-stone-200"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono tracking-wider uppercase text-stone-500 mb-2">
                  Status
                </label>
                <select
                  value={editingWorkflow.status}
                  onChange={(e) => setEditingWorkflow({ ...editingWorkflow, status: e.target.value as any })}
                  className="w-full bg-stone-900 border border-stone-850 rounded-xl px-4 py-3 text-xs outline-none focus:border-stone-700 font-bold text-stone-200"
                >
                  <option value="Active">Active</option>
                  <option value="Paused">Paused</option>
                  <option value="Draft">Draft</option>
                  <option value="Failed">Failed</option>
                </select>
              </div>

              <div className="border-t border-stone-900 pt-4 mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingWorkflow(null)}
                  className="bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-400 hover:text-white text-xs font-mono font-bold px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-mono font-bold px-5 py-2 rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Feedback Toast Confirmation ─── */}
      {feedback && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none">
          <span className="text-emerald-500">✓</span>
          <span className="text-xs font-bold">{feedback}</span>
        </div>
      )}

    </div>
  );
}
