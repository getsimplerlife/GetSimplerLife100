import { useMemo, useState } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import {
  recordAt,
  recordStatus,
  recordSummary,
  usePortalDashboard,
} from "~/lib/portal-dashboard";

/**
 * Tasks — /portal/tasks (P2-6 legacy sweep). READ-ONLY surface over the real
 * tenant task/workflow-run store (GET "/api/data/tasks" — authed, per-tenant,
 * server-remapped to { id, aiEmployee, status, customer, startedAt, summary }).
 * The old page POSTed arbitrary task actions here and the server persisted
 * them as junk task rows; both the junk-write POSTs and the cleanup button
 * have been removed per the P2-6 read-only mandate. Nothing on this page
 * writes to the queue. Portal-only; 30s polling; all-401 → "Sign in".
 */

function TasksQueue() {
  const { inputs, signedOut, loading, updatedAt } = usePortalDashboard(30000);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  const rows = inputs.taskRecords;

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    return rows.filter((r) => {
      const id = String(r.id ?? "").toLowerCase();
      const emp = String(r.aiEmployee ?? "").toLowerCase();
      const customer = String(r.customer ?? "").toLowerCase();
      const status = recordStatus(r);
      const matchesSearch = !q || id.includes(q) || emp.includes(q) || customer.includes(q);
      const matchesTab = activeTab === "all" || status === activeTab;
      return matchesSearch && matchesTab;
    });
  }, [rows, searchTerm, activeTab]);

  const tabs = [
    { key: "all", name: "All" },
    { key: "running", name: "Running" },
    { key: "completed", name: "Completed" },
    { key: "failed", name: "Failed" },
  ];

  const when = (r: Record<string, unknown>) => {
    const at = recordAt(r);
    return at > 0
      ? new Date(at).toLocaleString([], { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : "—";
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
        <h1 className="text-lg font-bold text-white mb-2">Sign in to see your tasks.</h1>
        <p className="text-sm text-stone-400 mb-6">This workspace's task and workflow-run records appear here once you're signed in.</p>
      </div>
    );
  }

  const mobileHidden = "hidden md:table-cell";

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">
      <div className="border-b border-stone-900 pb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Tasks</h1>
          <p className="text-stone-400 text-sm mt-1">
            Task and workflow-run records from your workspace — read-only, nothing here writes to the queue.
          </p>
        </div>
      </div>

      <div className="flex border-b border-stone-900 overflow-x-auto select-none gap-2 pb-px scrollbar-none">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={
              "px-4 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all " +
              (activeTab === tab.key
                ? "border-emerald-600 text-emerald-400"
                : "border-transparent text-stone-400 hover:text-stone-100")
            }
          >
            {tab.name}
          </button>
        ))}
      </div>

      <div className="bg-stone-950 p-4 rounded-2xl border border-stone-900">
        <input
          type="text"
          placeholder="Search by record ID, automation, or customer..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-stone-900/60 border border-stone-900 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-semibold placeholder-stone-500 text-stone-200"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-stone-950 rounded-2xl border border-stone-900 p-8">
          <PortalEmptyState
            title={rows.length === 0 ? "No task or workflow run records yet" : "No records match this view"}
            body={
              rows.length === 0
                ? "Records appear here as your workspace runs tasks and workflows. Nothing has been recorded for this workspace yet."
                : "Try a different search or status tab."
            }
          />
        </div>
      ) : (
        <div className="bg-stone-950 rounded-2xl border border-stone-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-semibold">
              <thead>
                <tr className="bg-stone-900/60 text-stone-500 font-bold border-b border-stone-900 uppercase tracking-wider">
                  <th className="p-4">Record ID</th>
                  <th className="p-4">When</th>
                  <th className="p-4">Automation</th>
                  <th className={`p-4 ${mobileHidden}`}>Customer</th>
                  <th className="p-4">Status</th>
                  <th className={`p-4 ${mobileHidden}`}>Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-900">
                {filtered.map((t) => {
                  const status = recordStatus(t);
                  const badge =
                    status === "running"
                      ? "bg-blue-500/10 text-blue-300 border border-blue-500/25"
                      : status === "completed"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                        : status === "failed"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/25"
                          : "bg-stone-900 text-stone-400 border border-stone-800";
                  return (
                    <tr key={String(t.id ?? JSON.stringify(t))} className="hover:bg-stone-900/40">
                      <td className="p-4 font-mono font-bold text-stone-400">{String(t.id ?? "—")}</td>
                      <td className="p-4 text-stone-400 whitespace-nowrap">{when(t)}</td>
                      <td className="p-4 font-bold text-stone-100">{String(t.aiEmployee ?? "—")}</td>
                      <td className={`p-4 text-stone-400 ${mobileHidden}`}>{String(t.customer ?? "—")}</td>
                      <td className="p-4">
                        <span className={"inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider " + badge}>
                          {status === "unknown" ? (String(t.status ?? "—")) : status}
                        </span>
                      </td>
                      <td className={`p-4 max-w-sm truncate text-stone-400 font-semibold ${mobileHidden}`}>
                        {recordSummary(t) || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-center text-[10px] font-mono text-stone-600 pt-2">
        {updatedAt != null
          ? `Data refreshes every 30 seconds · Last refreshed ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
          : "Data refreshes every 30 seconds."}
      </p>
    </div>
  );
}

export default TasksQueue;