import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";

/**
 * Workflows — /portal/workflows (P2-6 legacy sweep). Real read/write surface
 * over the tenant workflows store (`/api/data/workflows` GET/POST/DELETE —
 * authed, per-tenant; POST upserts by id, DELETE /workflows/:id removes).
 * The old page preloaded marketing demo templates as fake rows, fetched the
 * retired purchases store and employees API for an agent dropdown, fired a
 * "Test" POST that the server persisted as a junk workflow row, and showed
 * fabricated success rates/runtimes. All gone: only workflow rows this
 * workspace actually saved are rendered, with real Pause/Edit/Delete actions
 * and honest feedback. Portal-only.
 */

interface WorkflowRow {
  id?: string;
  name?: string;
  description?: string;
  status?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface Feedback {
  kind: "ok" | "error";
  text: string;
}

function WorkflowManager() {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkflowRow | null>(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch("/api/data/workflows", { credentials: "include" });
      if (res.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json().catch(() => ({}));
      setWorkflows(Array.isArray(body?.data) ? body.data : []);
      setSignedOut(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load workflows.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkflows();
    const t = setInterval(() => void fetchWorkflows(), 30000);
    return () => clearInterval(t);
  }, [fetchWorkflows]);

  const notice = (kind: Feedback["kind"], text: string) => {
    setFeedback({ kind, text });
    setTimeout(() => setFeedback(null), 3500);
  };

  const toggleStatus = async (wf: WorkflowRow) => {
    const nowActive = String(wf.status || "").toLowerCase() !== "active";
    const nextStatus = nowActive ? "active" : "paused";
    const label = wf.name || wf.id || "workflow";
    notice("ok", `${nowActive ? "Resuming" : "Pausing"} "${label}"…`);
    try {
      const res = await fetch("/api/data/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...wf, status: nextStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notice("ok", `"${label}" is now ${nextStatus}.`);
      await fetchWorkflows();
    } catch (e) {
      notice("error", `Couldn't ${nextStatus} "${label}" — ${e instanceof Error ? e.message : "try again."}`);
    }
  };

  const deleteWorkflow = async (wf: WorkflowRow) => {
    const label = wf.name || wf.id || "workflow";
    if (!wf.id) return;
    if (!confirm(`Delete workflow "${label}"? This removes it from this workspace.`)) return;
    notice("ok", `Deleting "${label}"…`);
    try {
      const res = await fetch(`/api/data/workflows/${encodeURIComponent(wf.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notice("ok", `"${label}" deleted.`);
      await fetchWorkflows();
    } catch (e) {
      notice("error", `Couldn't delete "${label}" — ${e instanceof Error ? e.message : "try again."}`);
    }
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const label = editing.name || editing.id || "workflow";
    notice("ok", `Saving changes to "${label}"…`);
    try {
      const res = await fetch("/api/data/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(editing),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      notice("ok", `Saved changes to "${label}".`);
      setEditing(null);
      await fetchWorkflows();
    } catch (err) {
      notice("error", `Couldn't save changes to "${label}" — try again.`);
      console.error(err);
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return workflows.filter((wf) => {
      const name = String(wf.name ?? "").toLowerCase();
      const id = String(wf.id ?? "").toLowerCase();
      const status = String(wf.status ?? "").toLowerCase();
      const matchesSearch = !q || name.includes(q) || id.includes(q);
      const matchesStatus = statusFilter === "all" || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [workflows, searchTerm, statusFilter]);

  const statusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === "active") return "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50";
    if (s === "paused") return "bg-stone-900 text-stone-400 border border-stone-800";
    if (s === "draft") return "bg-blue-950/40 text-blue-400 border border-blue-900/50";
    if (s === "failed") return "bg-rose-950/40 text-rose-400 border border-rose-900/50";
    return "bg-stone-900 text-stone-500 border border-stone-800";
  };

  const field = (wf: WorkflowRow, key: string) => {
    const v = wf[key];
    return typeof v === "string" && v.trim() ? v : null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (signedOut) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-stone-950 border border-stone-900 rounded-2xl p-8 text-center">
        <h1 className="text-lg font-bold text-white mb-2">Sign in to see your workflows.</h1>
        <p className="text-sm text-stone-400 mb-6">This workspace's workflows appear here once you're signed in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto text-stone-100 select-none">
      <div className="border-b border-stone-900 pb-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Workflows</h1>
          <p className="text-stone-400 text-xs mt-1">
            Workflows this workspace has saved. Pause, edit, and delete are applied to the real store.
          </p>
        </div>
        <Link
          to="/portal/workflows/builder"
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs font-mono px-5 py-3 rounded-xl transition-all shadow-lg active:scale-95"
        >
          Create Custom Workflow
        </Link>
      </div>

      {error && (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl px-5 py-3 text-xs font-mono text-rose-300">
          Couldn't load workflows — showing the last loaded values.
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 bg-stone-950 p-3.5 border border-stone-900 rounded-xl">
        <div className="flex-1 flex items-center bg-stone-900/60 border border-stone-900 rounded-xl px-3 py-2">
          <input
            type="text"
            placeholder="Search workflows by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-transparent border-0 text-xs outline-none font-medium placeholder-stone-500 text-stone-200"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-stone-900/60 border border-stone-900 rounded-xl px-4 py-2.5 text-xs outline-none font-mono font-bold text-stone-300"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="draft">Draft</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="max-w-xl mx-auto my-8">
          <PortalEmptyState
            title={workflows.length === 0 ? "No workflows in this workspace yet" : "No workflows match this view"}
            body={
              workflows.length === 0
                ? "Workflows you save appear here. Open the builder to create your first one."
                : "Try a different search or status filter."
            }
          />
          {workflows.length === 0 && (
            <div className="text-center mt-6">
              <Link
                to="/portal/workflows/builder"
                className="inline-flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg active:scale-95"
              >
                Open the workflow builder
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((wf) => {
            const status = String(wf.status ?? "—");
            const updated = field(wf, "updatedAt");
            return (
              <div
                key={String(wf.id ?? JSON.stringify(wf))}
                className="bg-stone-950 border border-stone-900 hover:border-stone-800 rounded-2xl p-5 flex flex-col justify-between gap-5 transition-all hover:shadow-lg"
              >
                <div className="space-y-4">
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] font-mono font-bold text-stone-400 bg-stone-900/60 border border-stone-900 px-2 py-0.5 rounded-md truncate max-w-[150px]">
                      {wf.id ? `ID: ${wf.id.slice(0, 8)}` : "ID: —"}
                    </span>
                    <span className={"inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-black uppercase tracking-wider " + statusBadge(status)}>
                      {status === "—" ? "—" : status}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-white leading-tight truncate">{field(wf, "name") ?? "Unnamed workflow"}</h3>
                    <p className="text-stone-400 text-xs leading-relaxed line-clamp-2 min-h-[32px]">{field(wf, "description") ?? "No description."}</p>
                  </div>
                  <div className="space-y-1 text-[10px] font-mono text-stone-500">
                    {updated && (
                      <div>
                        <span className="text-stone-400 font-bold">Last saved:</span> {updated}
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-stone-900 pt-4 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setEditing(wf)}
                    className="bg-stone-900 hover:bg-stone-800 text-stone-300 text-[10px] font-mono font-bold py-1.5 rounded-lg border border-stone-800 transition-all cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleStatus(wf)}
                    className="bg-stone-900 hover:bg-stone-800 text-stone-300 text-[10px] font-mono font-bold py-1.5 rounded-lg border border-stone-800 transition-all cursor-pointer"
                  >
                    {status.toLowerCase() === "active" ? "Pause" : "Resume"}
                  </button>
                  <button
                    onClick={() => deleteWorkflow(wf)}
                    className="bg-rose-950/40 hover:bg-rose-900/40 text-rose-400 text-[10px] font-mono font-bold py-1.5 rounded-lg border border-rose-900/30 transition-all cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-950 border border-stone-900 rounded-2xl w-full max-w-lg overflow-hidden animate-zoomIn">
            <div className="border-b border-stone-900 p-5 flex justify-between items-center">
              <h3 className="text-base font-black text-white">Edit Workflow Details</h3>
              <button
                onClick={() => setEditing(null)}
                className="text-stone-500 hover:text-stone-300 text-sm"
              >
                Close
              </button>
            </div>

            <form onSubmit={saveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-mono tracking-wider uppercase text-stone-500 mb-2">Workflow Name</label>
                <input
                  type="text"
                  required
                  value={editing.name || ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-900 rounded-xl px-4 py-3 text-xs outline-none focus:border-stone-700 font-bold text-stone-200"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono tracking-wider uppercase text-stone-500 mb-2">Description</label>
                <textarea
                  rows={4}
                  required
                  value={editing.description || ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-900 rounded-xl p-4 text-xs font-medium leading-relaxed outline-none focus:border-stone-700 placeholder-stone-600 resize-none text-stone-200"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono tracking-wider uppercase text-stone-500 mb-2">Status</label>
                <select
                  value={editing.status || ""}
                  onChange={(e) => setEditing({ ...editing, status: e.target.value })}
                  className="w-full bg-stone-900 border border-stone-900 rounded-xl px-4 py-3 text-xs outline-none focus:border-stone-700 font-bold text-stone-200"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="draft">Draft</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="border-t border-stone-900 pt-4 mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-400 hover:text-white text-xs font-mono font-bold px-4 py-2 rounded-lg"
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

      {feedback && (
        <div
          role="status"
          className={
            "fixed bottom-6 right-6 text-white px-5 py-3 rounded-2xl shadow-xl z-50 flex items-center gap-3 animate-slideUp select-none text-xs font-bold border " +
            (feedback.kind === "ok" ? "bg-stone-900 border-emerald-500" : "bg-stone-950 border-rose-500")
          }
        >
          {feedback.kind === "ok" ? "✓" : "!"} <span>{feedback.text}</span>
        </div>
      )}
    </div>
  );
}

export default WorkflowManager;