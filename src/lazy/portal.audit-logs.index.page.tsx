import { useCallback, useEffect, useState } from "react";

/**
 * SLICE 175 — /portal/audit-logs, made true.
 *
 * THE DEFECTS THIS FILE PINS (all verified at 67a67d8).
 *
 * 1. The table was PERMANENTLY EMPTY. `GET /api/audit-logs` answers
 *    `{ data, total, page, limit }`; this page read `data.logs`, so it stored
 *    `[]` on every response while `total` was non-zero — the table said "No
 *    audit logs found" and the pager drew underneath it.
 * 2. Every filter was a no-op. The pills sent `severity`/`status`, the fetch
 *    sent `offset`/`sortBy`/`sortDir`, and the handler read none of them. A
 *    control that promises a filter it does not apply is worse than no control.
 * 3. "Export Audit CSV" fired a POST and discarded the response: no blob, no
 *    download, ever.
 * 4. The table read `created_at` / `email` / `details`, but the store writes
 *    `timestamp` / `user` / `detail` — so even with rows it would have rendered
 *    "—" and "System" for every entry. It also DEFAULTED a missing severity to
 *    "info" and a missing status to "success", inventing values the log does
 *    not record.
 *
 * What is left here is only what the store can answer: the actor, the action,
 * the resource and the detail, plus a real search, a real newest/oldest sort, a
 * real pager and a real CSV of the rows the current search selects. Severity
 * and status are not recorded in this log, so there is no pill or column for
 * them — the page says so instead of showing a filter that always returns
 * nothing.
 */

interface AuditEntry {
  id?: string;
  timestamp?: string;
  created_at?: string;
  user?: string;
  email?: string;
  action?: string;
  resource?: string;
  detail?: string;
  details?: string;
  ip?: string;
}

interface AuditStats {
  totalEvents: number;
  uniqueUsers: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

const PAGE_SIZE = 25;

/** The store's field names first, then the older aliases. */
const actorOf = (log: AuditEntry) => log.user || log.email || "";
const whenOf = (log: AuditEntry) => log.timestamp || log.created_at || "";
const detailOf = (log: AuditEntry) => {
  const raw = log.detail ?? log.details;
  if (raw === undefined || raw === null || raw === "") return "";
  return typeof raw === "string" ? raw : JSON.stringify(raw);
};

function SystemAuditLogs() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page + 1));
      params.set("limit", String(PAGE_SIZE));
      params.set("sortBy", "timestamp");
      params.set("sortDir", sortDir);
      if (search) params.set("search", search);

      const res = await fetch(`/api/audit-logs?${params}`, { credentials: "include" });
      if (!res.ok) {
        // A status is not an empty log: a 401/500 must look like a failure.
        setLogs([]);
        setTotal(0);
        setStats(null);
        setError(
          res.status === 401
            ? "Please sign in to read this workspace's audit log."
            : `Could not load the audit log (HTTP ${res.status}).`,
        );
        return;
      }
      const payload = (await res.json()) as { data?: AuditEntry[]; total?: number; stats?: AuditStats };
      setLogs(Array.isArray(payload.data) ? payload.data : []);
      setTotal(typeof payload.total === "number" ? payload.total : 0);
      setStats(payload.stats ?? null);
    } catch (err) {
      setLogs([]);
      setTotal(0);
      setStats(null);
      setError("Could not load the audit log: the request failed.");
    } finally {
      setLoading(false);
    }
  }, [page, sortDir, search]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  /** Real CSV of exactly the rows the current search selects (server-built). */
  const handleExport = async () => {
    setExportError("");
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set("format", "csv");
      params.set("sortBy", "timestamp");
      params.set("sortDir", sortDir);
      if (search) params.set("search", search);
      const res = await fetch(`/api/audit-logs?${params}`, { credentials: "include" });
      if (!res.ok) {
        setExportError(`Could not export the audit log (HTTP ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Could not export the audit log.");
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (timestamp: string | null | undefined) => {
    if (!timestamp) return "—";
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading && logs.length === 0 && !error) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-2 border-stone-800 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const firstRow = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastRow = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">
      {/* Header */}
      <div className="border-b border-stone-900 pb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">📜 System Audit Logs</h1>
          <p className="text-stone-400 mt-1 text-sm">
            Every action recorded for this workspace — who did it, to which record, and when. Entries are appended by the
            server and are never edited.
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="bg-stone-900 hover:bg-stone-800 disabled:opacity-50 text-stone-300 font-bold text-xs px-5 py-2.5 rounded-xl border border-stone-800 transition-all self-start md:self-auto"
        >
          {exporting ? "Building CSV…" : "🔒 Export Audit CSV"}
        </button>
      </div>

      {exportError && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm font-bold text-rose-300" role="alert">
          {exportError}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm font-bold text-rose-300" role="alert">
          {error}
        </div>
      )}

      {/* Stats — computed server-side over this workspace's whole log */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">All events</span>
            <p className="text-xl font-black text-white mt-1">{stats.totalEvents.toLocaleString()}</p>
          </div>
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">Actors</span>
            <p className="text-xl font-black text-white mt-1">{stats.uniqueUsers}</p>
          </div>
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">First event</span>
            <p className="text-sm font-black text-white mt-1">{formatDate(stats.firstEventAt)}</p>
          </div>
          <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500 font-bold">Latest event</span>
            <p className="text-sm font-black text-white mt-1">{formatDate(stats.lastEventAt)}</p>
          </div>
        </div>
      )}

      {/* Search + sort — the only two filters this log can answer */}
      <form onSubmit={handleSearch} className="bg-stone-950 border border-stone-900 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            aria-label="Search the audit log"
            placeholder="Search by actor, action, resource, or detail…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 bg-stone-900 border border-stone-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-stone-200 placeholder-stone-500"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-5 py-2 rounded-lg transition-all"
            >
              Search
            </button>
            <button
              type="button"
              onClick={() => {
                setPage(0);
                setSortDir(sortDir === "desc" ? "asc" : "desc");
              }}
              className="bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 font-bold text-xs px-4 py-2 rounded-lg transition-all"
            >
              {sortDir === "desc" ? "Newest first ↓" : "Oldest first ↑"}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-stone-600 mt-2">
          This log records the actor, action, resource and detail of each event. It does not record a severity or a
          status, so there is no severity or status filter here.
        </p>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-900">
              {error ? (
                // An error must never wear the empty state's clothes: "No audit
                // logs found" is a claim about the log, and a failed read is not
                // evidence about the log.
                <tr>
                  <td colSpan={6} className="p-12 text-center text-stone-500">
                    <div className="text-2xl mb-2">⚠️</div>
                    <p className="text-xs font-bold">The audit log could not be loaded</p>
                    <p className="text-[10px] text-stone-600 mt-1">This is an error, not an empty log.</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-stone-500">
                    <div className="text-2xl mb-2">📭</div>
                    {total > 0 ? (
                      <>
                        <p className="text-xs font-bold">No rows on this page</p>
                        <p className="text-[10px] text-stone-600 mt-1">The log holds {total.toLocaleString()} entries — go back a page.</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold">No audit logs found</p>
                        <p className="text-[10px] text-stone-600 mt-1">
                          {search ? "Nothing matches this search." : "Nothing has been recorded for this workspace yet."}
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                logs.map((log, idx) => (
                  <tr key={log.id || `row-${idx}`} className="hover:bg-stone-900/30 transition-colors">
                    <td className="p-4 font-mono text-[10px] text-stone-500 max-w-[120px] truncate" title={log.id}>
                      {log.id ? `${log.id.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="p-4 text-stone-400 text-[10px] whitespace-nowrap">{formatDate(whenOf(log))}</td>
                    <td className="p-4 font-bold text-white text-[10px] max-w-[140px] truncate" title={actorOf(log)}>
                      {actorOf(log) || "—"}
                    </td>
                    <td className="p-4">
                      <span className="text-stone-200 font-bold text-[10px]">{log.action || "—"}</span>
                    </td>
                    <td className="p-4 text-stone-400 text-[10px] max-w-[120px] truncate" title={log.resource || ""}>
                      {log.resource || "—"}
                    </td>
                    <td className="p-4 text-stone-500 text-[10px] max-w-[200px] truncate" title={detailOf(log)}>
                      {detailOf(log) ? (detailOf(log).length > 80 ? `${detailOf(log).slice(0, 80)}…` : detailOf(log)) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="border-t border-stone-900 px-4 py-3 flex items-center justify-between text-xs">
            <span className="text-stone-500 font-mono">
              Showing {firstRow}–{lastRow} of {total.toLocaleString()}
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
                disabled={(page + 1) * PAGE_SIZE >= total}
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

export default SystemAuditLogs;
