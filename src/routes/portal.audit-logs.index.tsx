import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/audit-logs/")({
  component: SystemAuditLogs,
});

function SystemAuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String(page * pageSize));
      params.set("sortBy", "created_at");
      params.set("sortDir", "desc");
      if (searchTerm) params.set("search", searchTerm);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/audit-logs?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setStats(data.stats || null);
      }
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [page, severityFilter, statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchLogs();
  };

  const formatDate = (timestamp: number | string | null) => {
    if (!timestamp) return "—";
    const d = typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const severityOptions = [
    { key: "all", name: "All Severities" },
    { key: "info", name: "Info" },
    { key: "warning", name: "Warning" },
    { key: "error", name: "Error" },
    { key: "critical", name: "Critical" },
  ];

  const statusOptions = [
    { key: "all", name: "All Statuses" },
    { key: "success", name: "Success" },
    { key: "failure", name: "Failure" },
    { key: "pending", name: "Pending" },
  ];

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      failure: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    };
    return map[status] || "bg-stone-800 text-stone-400 border-stone-700";
  };

  const severityBadge = (severity: string) => {
    const map: Record<string, string> = {
      info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      error: "bg-rose-500/10 text-rose-400 border-rose-500/20",
      critical: "bg-red-600/20 text-red-400 border-red-500/30",
    };
    return map[severity] || "bg-stone-800 text-stone-400 border-stone-700";
  };

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">
      {/* Header */}
      <div className="border-b border-stone-900 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">📜 System Audit Logs</h1>
          <p className="text-stone-400 mt-1 text-sm">
            Immutable ledger logging user actions, AI decisions, API calls, and tenant security events.
            {stats && <span className="text-stone-600 ml-3 text-xs font-mono">{stats.totalEvents?.toLocaleString() || 0} total events</span>}
          </p>
        </div>
        <button
          onClick={() => fetch("/api/audit-log", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ action: "export_audit_csv", resource: "audit-logs", details: { format: "csv" } }),
          })}
          className="bg-stone-900 hover:bg-stone-800 text-stone-300 font-bold text-xs px-5 py-2.5 rounded-xl border border-stone-800 transition-all self-start md:self-auto"
        >
          🔒 Export Audit CSV
        </button>
      </div>

      {/* Stats Mini Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Total Events</span>
            <p className="text-xl font-black text-white mt-1">{stats.totalEvents?.toLocaleString() || 0}</p>
          </div>
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Unique Users</span>
            <p className="text-xl font-black text-white mt-1">{stats.uniqueUsers || 0}</p>
          </div>
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">Recent Errors</span>
            <p className={`text-xl font-black mt-1 ${stats.recentErrors > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {stats.recentErrors || 0}
            </p>
          </div>
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[9px] font-mono uppercase tracking-wider text-stone-500 font-bold">7-Day Window</span>
            <p className="text-xl font-black text-white mt-1">Last 7d</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {severityOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setSeverityFilter(opt.key); setPage(0); }}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                severityFilter === opt.key
                  ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                  : "bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700"
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>
        <span className="text-stone-700">|</span>
        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {statusOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => { setStatusFilter(opt.key); setPage(0); }}
              className={`px-3 py-1.5 text-[10px] font-bold rounded-lg border transition-all ${
                statusFilter === opt.key
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-stone-900 border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700"
              }`}
            >
              {opt.name}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="bg-stone-950 border border-stone-900 rounded-xl p-4">
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by user, action, resource, or details..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 bg-stone-900 border border-stone-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-stone-200 placeholder-stone-500"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2 rounded-lg transition-all"
          >
            Search
          </button>
        </div>
      </form>

      {/* Audit Log Table */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-stone-900/50 text-stone-500 font-bold border-b border-stone-900 uppercase tracking-wider text-[10px]">
                <th className="p-4">Log ID</th>
                <th className="p-4">Timestamp</th>
                <th className="p-4">Actor</th>
                <th className="p-4">Action</th>
                <th className="p-4">Resource</th>
                <th className="p-4">Details</th>
                <th className="p-4">Severity</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-900">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-stone-500">
                    <div className="text-2xl mb-2">📭</div>
                    <p className="text-xs font-bold">No audit logs found</p>
                    <p className="text-[10px] text-stone-600 mt-1">Try adjusting your filters or search terms.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-stone-900/30 transition-colors">
                    <td className="p-4 font-mono text-[10px] text-stone-500 max-w-[120px] truncate" title={log.id}>
                      {log.id?.slice(0, 8)}...
                    </td>
                    <td className="p-4 text-stone-400 text-[10px] whitespace-nowrap">{formatDate(log.created_at)}</td>
                    <td className="p-4 font-bold text-white text-[10px] max-w-[140px] truncate" title={log.email || log.user_id || ""}>
                      {log.email || log.user_id || "System"}
                    </td>
                    <td className="p-4">
                      <span className="text-stone-200 font-bold text-[10px]">{log.action}</span>
                    </td>
                    <td className="p-4 text-stone-400 text-[10px] max-w-[120px] truncate" title={log.resource || ""}>
                      {log.resource || "—"}
                    </td>
                    <td className="p-4 text-stone-500 text-[10px] max-w-[200px] truncate" title={typeof log.details === "string" ? log.details : JSON.stringify(log.details || "")}>
                      {typeof log.details === "string" ? log.details : (log.details ? JSON.stringify(log.details).slice(0, 80) : "—")}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${severityBadge(log.severity)}`}>
                        {log.severity || "info"}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${statusBadge(log.status)}`}>
                        {log.status || "success"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > pageSize && (
          <div className="border-t border-stone-900 px-4 py-3 flex items-center justify-between text-xs">
            <span className="text-stone-500 font-mono">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total.toLocaleString()}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 font-bold hover:text-white hover:border-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                ← Previous
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={(page + 1) * pageSize >= total}
                className="px-3 py-1.5 rounded-lg bg-stone-900 border border-stone-800 text-stone-400 font-bold hover:text-white hover:border-stone-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Refresh indicator */}
      {loading && (
        <div className="fixed bottom-6 right-6 bg-stone-900 border border-stone-800 text-stone-300 px-4 py-2 rounded-xl shadow-xl z-50 flex items-center gap-2 font-mono text-[10px]">
          <div className="w-3 h-3 border border-stone-600 border-t-white rounded-full animate-spin" />
          Refreshing...
        </div>
      )}
    </div>
  );
}
