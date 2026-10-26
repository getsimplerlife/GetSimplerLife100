import { useState, useEffect } from "react";
function AuditDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const PAGE_SIZE = 20;
  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(page + 1),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/audit-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data.data || []);
      // Audit-B (10-26): stats come from the REAL /api/audit-logs store —
      // full set, unfiltered, derived client-side (no separate stats endpoint).
      try {
        const sr = await fetch("/api/audit-logs?limit=10000");
        if (sr.ok) {
          const sj = await sr.json();
          const all = sj.data || [];
          const byAction: Record<string, number> = {};
          for (const l of all) {
            const a = l.action || "unknown";
            byAction[a] = (byAction[a] || 0) + 1;
          }
          setStats({
            totalEvents: all.length,
            uniqueUsers: new Set(all.map((l: any) => l.user || l.user_email)).size,
            byAction,
          });
        }
      } catch { /* stats are best-effort; the log table still renders */ }
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };
  useEffect(() => { fetchLogs(); }, [page]);
  const handleSearch = () => { setPage(0); fetchLogs(); };
  const formatDate = (ts: any) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };
  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-stone-100">Audit Logs & Compliance Dashboard</h1>
        <a href="/portal/admin" className="text-sm text-blue-600 hover:underline">← Back to Admin</a>
      </div>
      {/* Stats Cards (derived from the real audit store) */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-stone-900 rounded-lg shadow-lg shadow-black/20 p-4 border-l-4 border-blue-500">
            <div className="text-sm text-stone-500">Total Events</div>
            <div className="text-2xl font-bold">{stats.totalEvents || 0}</div>
          </div>
          <div className="bg-stone-900 rounded-lg shadow-lg shadow-black/20 p-4 border-l-4 border-green-500">
            <div className="text-sm text-stone-500">Unique Users</div>
            <div className="text-2xl font-bold">{stats.uniqueUsers || 0}</div>
          </div>
          <div className="bg-stone-900 rounded-lg shadow-lg shadow-black/20 p-4 border-l-4 border-purple-500">
            <div className="text-sm text-stone-500">Unique Actions</div>
            <div className="text-2xl font-bold">{Object.keys(stats.byAction || {}).length}</div>
          </div>
        </div>
      )}
      {/* Filters */}
      <div className="bg-stone-900 rounded-lg shadow-lg shadow-black/20 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-stone-500 mb-1">Search</label>
            <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Search email, resource, details..."
              value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()} />
          </div>
          <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700" onClick={handleSearch}>Search</button>
        </div>
      </div>
      {/* Error */}
      {error && <div className="bg-red-50 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}
      {/* Logs Table */}
      <div className="bg-stone-900 rounded-lg shadow-lg shadow-black/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-800/60">
              <tr>
                <th className="px-4 py-3 text-left">Time</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Resource</th>
                <th className="px-4 py-3 text-center">Severity</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-400">No audit logs found</td></tr>
              ) : logs.map((log) => (
                <tr key={log.id} className="border-t hover:bg-stone-800/40 cursor-pointer" onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}>
                  <td className="px-4 py-3 whitespace-nowrap text-stone-500">{formatDate(log.timestamp || log.created_at)}</td>
                  <td className="px-4 py-3 font-medium">{log.action}</td>
                  <td className="px-4 py-3 text-stone-400">{log.user || log.user_email || "—"}</td>
                  <td className="px-4 py-3 text-stone-400 max-w-[200px] truncate">{log.resource || "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-stone-800/40 text-stone-400">
                      {log.severity || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-stone-800/40 text-stone-400">
                      {log.status || "—"}
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
          <div className="border-t bg-stone-900 p-4">
            <h3 className="font-semibold text-sm mb-2">Event Details</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-stone-500">Event ID:</span> <code className="text-xs">{selectedLog.id}</code></div>
              <div><span className="text-stone-500">IP Address:</span> {selectedLog.ip || selectedLog.ip_address || "unknown"}</div>
              <div className="col-span-2"><span className="text-stone-500">Details:</span>
                <pre className="bg-stone-950 border border-stone-800 rounded p-2 mt-1 text-xs overflow-auto max-h-40">
                  {JSON.stringify(selectedLog.detail ?? selectedLog.details ?? null, null, 2) || "No details"}
                </pre>
              </div>
            </div>
          </div>
        )}
        {/* Pagination */}
        <div className="border-t px-4 py-3 flex justify-between items-center">
          <span className="text-xs text-stone-500">Page {page + 1}</span>
          <div className="flex gap-2">
            <button className="px-3 py-1 border rounded text-sm disabled:opacity-50" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <button className="px-3 py-1 border rounded text-sm disabled:opacity-50" disabled={logs.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      </div>
      {/* Action Distribution */}
      {stats && Object.keys(stats.byAction || {}).length > 0 && (
        <div className="bg-stone-900 rounded-lg shadow-lg shadow-black/20 p-4 mt-6">
          <h2 className="font-semibold mb-3">Action Distribution</h2>
          <div className="space-y-2">
            {Object.entries(stats.byAction).map(([action, count]) => (
              <div key={action} className="flex items-center gap-3">
                <span className="w-32 text-sm font-medium truncate">{action}</span>
                <div className="flex-1 bg-stone-800 rounded-full h-4 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full transition-all" style={{
                    width: `${Math.min(100, (count as number) / Math.max(...Object.values(stats.byAction) as number[]) * 100)}%`
                  }} />
                </div>
                <span className="text-sm text-stone-400 w-12 text-right">{count as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
export default AuditDashboard;