import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/portal/admin/audit")({
  component: AuditDashboard,
});

function AuditDashboard() {
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterSeverity, setFilterSeverity] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const PAGE_SIZE = 20;

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        sortBy,
        sortDir,
      });
      if (search) params.set("search", search);
      if (filterAction) params.set("action", filterAction);
      if (filterSeverity) params.set("severity", filterSeverity);

      const res = await fetch(`/api/audit-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.logs || []);

      const statsRes = await fetch("/api/audit-logs/stats");
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, [page, sortBy, sortDir]);

  const handleSearch = () => { setPage(0); fetchLogs(); };

  const toggleSort = (field: string) => {
    if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: string }) =>
    sortBy === field ? (sortDir === "desc" ? " 🔽" : " 🔼") : " ⇅";

  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "bg-red-100 text-red-800";
      case "error": return "bg-orange-100 text-orange-800";
      case "warning": return "bg-yellow-100 text-yellow-800";
      default: return "bg-blue-100 text-blue-800";
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "success": return "bg-green-100 text-green-800";
      case "failure": return "bg-red-100 text-red-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs & Compliance Dashboard</h1>
        <a href="/portal/admin" className="text-sm text-blue-600 hover:underline">← Back to Admin</a>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
            <div className="text-sm text-gray-500">Total Events (7d)</div>
            <div className="text-2xl font-bold">{stats.totalEvents || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
            <div className="text-sm text-gray-500">Unique Users</div>
            <div className="text-2xl font-bold">{stats.uniqueUsers || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
            <div className="text-sm text-gray-500">Errors (7d)</div>
            <div className="text-2xl font-bold">{stats.recentErrors || 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
            <div className="text-sm text-gray-500">Unique Actions</div>
            <div className="text-2xl font-bold">{Object.keys(stats.byAction || {}).length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
            <div className="text-sm text-gray-500">Critical</div>
            <div className="text-2xl font-bold">{stats.bySeverity?.critical || 0}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">Search</label>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Search email, resource, details..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <select className="border rounded px-3 py-2 text-sm" value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(0); }}>
              <option value="">All Actions</option>
              <option value="login">Login</option>
              <option value="register">Register</option>
              <option value="run_agent">Run Agent</option>
              <option value="upload_file">Upload File</option>
              <option value="admin_action">Admin Action</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Severity</label>
            <select className="border rounded px-3 py-2 text-sm" value={filterSeverity} onChange={e => { setFilterSeverity(e.target.value); setPage(0); }}>
              <option value="">All Severities</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="critical">Critical</option>
            </select>
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700" onClick={handleSearch}>Search</button>
        </div>
      </div>

      {/* Error */}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("created_at")}>
                  Time{SortIcon({ field: "created_at" })}
                </th>
                <th className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("action")}>
                  Action{SortIcon({ field: "action" })}
                </th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Resource</th>
                <th className="px-4 py-3 text-center">Severity</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No audit logs found</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-500">{formatDate(log.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{log.action}</td>
                  <td className="px-4 py-3 text-gray-600">{log.user_email || "—"}</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">{log.resource || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${severityColor(log.severity)}`}>
                      {log.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(log.status)}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-blue-600 text-xs">View</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded Details */}
        {selectedLog && (
          <div className="border-t bg-gray-50 p-4">
            <h3 className="font-semibold text-sm mb-2">Event Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-gray-500">Event ID:</span> <code className="text-xs">{selectedLog.id}</code></div>
              <div><span className="text-gray-500">IP Address:</span> {selectedLog.ip_address || "unknown"}</div>
              <div className="col-span-2"><span className="text-gray-500">Details:</span>
                <pre className="bg-white border rounded p-2 mt-1 text-xs overflow-auto max-h-40">
                  {JSON.stringify(selectedLog.details, null, 2) || "No details"}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Pagination */}
        <div className="border-t px-4 py-3 flex justify-between items-center">
          <span className="text-xs text-gray-500">Page {page + 1}</span>
          <div className="flex gap-2">
            <button className="px-3 py-1 border rounded text-sm disabled:opacity-50" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <button className="px-3 py-1 border rounded text-sm disabled:opacity-50" disabled={logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      </div>

      {/* Action Distribution */}
      {stats && Object.keys(stats.byAction || {}).length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mt-6">
          <h2 className="font-semibold mb-3">Action Distribution</h2>
          <div className="space-y-2">
            {Object.entries(stats.byAction).map(([action, count]) => (
              <div key={action} className="flex items-center gap-3">
                <span className="w-32 text-sm font-medium truncate">{action}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full transition-all" style={{
                    width: `${Math.min(100, (count as number) / Math.max(...Object.values(stats.byAction) as number[]) * 100)}%`
                  }} />
                </div>
                <span className="text-sm text-gray-600 w-12 text-right">{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}