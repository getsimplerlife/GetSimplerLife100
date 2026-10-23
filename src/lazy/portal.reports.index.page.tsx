import { useEffect, useRef, useState } from "react";
import { PortalEmptyState } from "~/components/PortalEmptyState";

/**
 * Reports — /portal/reports (P2-6 legacy sweep). Read-only view of the
 * workspace's real reports store (GET "/api/data/reports" — authed,
 * per-tenant). The old page faked a report-generate flow: its POSTs are
 * discarded by the server (logs-only, nothing persisted), and downloads were
 * claimed but never existed. That theater is gone — this surface only renders
 * what the store actually returns, and shows an honest empty state when there
 * is nothing. SSR-safe, 30s polling, all-401 → "Sign in". Portal-only.
 */

type ReportRow = Record<string, unknown>;

function ReportsCenter() {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const firstRun = useRef(true);

  const load = async () => {
    try {
      const res = await fetch("/api/data/reports", { credentials: "include" });
      if (res.status === 401) {
        setSignedOut(true);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json().catch(() => ({}));
      setRows(Array.isArray(body?.data) ? body.data : []);
      setSignedOut(false);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load reports.");
    } finally {
      if (firstRun.current) {
        firstRun.current = false;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cell = (r: ReportRow, key: string) => {
    const v = r[key];
    return typeof v === "string" && v.trim() ? v : "—";
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
        <h1 className="text-lg font-bold text-white mb-2">Sign in to see your reports.</h1>
        <p className="text-sm text-stone-400 mb-6">This workspace's reports appear here once you're signed in.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">
      <div className="border-b border-stone-900 pb-6">
        <h1 className="text-3xl font-black text-white tracking-tight">Reports</h1>
        <p className="text-stone-400 text-sm mt-1">
          Reports this workspace has stored. This is a read-only view — generating reports
          isn't available from this page yet.
        </p>
      </div>

      {error && (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl px-5 py-3 text-xs font-mono text-rose-300">
          Couldn't load reports — showing the last loaded values.
        </div>
      )}

      {rows.length === 0 ? (
        <div className="max-w-xl mx-auto my-8">
          <PortalEmptyState
            title="No reports yet"
            body="Reports appear here once this workspace has stored them. Nothing has been generated for this workspace yet."
          />
        </div>
      ) : (
        <div className="bg-stone-950 border border-stone-900 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs font-semibold">
            <thead>
              <tr className="bg-stone-900/60 text-stone-500 border-b border-stone-900 uppercase tracking-wider">
                <th className="p-4 font-bold">Report Name</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Frequency</th>
                <th className="p-4 font-bold">Format</th>
                <th className="p-4 text-right font-bold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-900 text-stone-300">
              {rows.map((rep, idx) => (
                <tr key={idx} className="hover:bg-stone-900/40">
                  <td className="p-4 font-black text-white">{cell(rep, "name")}</td>
                  <td className="p-4">{cell(rep, "type")}</td>
                  <td className="p-4">{cell(rep, "frequency")}</td>
                  <td className="p-4">{cell(rep, "format")}</td>
                  <td className="p-4 text-right text-stone-500">{cell(rep, "createdAt")}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

export default ReportsCenter;