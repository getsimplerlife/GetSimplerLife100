import { useCallback, useEffect, useState } from "react";

/**
 * Admin — Page Views — /portal/admin/page-views (SLICE 159).
 *
 * The first-party page counter, read-only. Every number on this screen comes
 * from the owner-gated `GET /api/admin/page-views`, which counts real HTML page
 * renders on the server into `<DATA_DIR>/page_views.json`. There is no
 * third-party analytics script anywhere in the app, and nothing here is
 * estimated, extrapolated or invented:
 *
 *   - nothing recorded yet  → the page SAYS so, it does not show a cheerful 0;
 *   - the counter can't write → a red banner says since when, how many views
 *     are held in memory only, and what the error was;
 *   - the store can't be read → that is reported instead of an empty chart.
 *
 * The counter stores aggregate counts only: path × UTC day → count. No IP, no
 * user agent, no email, no user id, no cookies.
 */

interface PageViewDaySeries {
  day: string;
  views: number;
}

interface PageViewWriteHealth {
  ok: boolean;
  failingSince: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  lastRecoveredAt: string | null;
  consecutiveFailures: number;
  pendingInMemory: number;
  lastFlushAt: string | null;
}

interface PageViewSummary {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  totalViews: number;
  uniquePaths: number;
  days: PageViewDaySeries[];
  topPaths: { path: string; views: number }[];
  hasAnyData: boolean;
  retentionDays: number;
  storedDays: number;
  readError: string | null;
  writeHealth: PageViewWriteHealth;
  /** SLICE 160 — where this deployment actually writes (server-reported). */
  location?: PageViewCounterLocation;
}

interface PageViewCounterLocation {
  dataDir: string;
  counterFile: string;
  insidePublishTree: boolean;
  dirExists: boolean;
  fileExists: boolean;
  bytes: number | null;
  lastWriteAt: string | null;
  writable: boolean;
}

/** "2026-10-31T09:12:04.123Z" → "2026-10-31 09:12 UTC" (never a local guess). */
function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

function AdminPageViewsPage() {
  const [data, setData] = useState<PageViewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/page-views", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json().catch(() => null)) as PageViewSummary | null;
      if (!body || typeof body.totalViews !== "number") throw new Error("unexpected response shape");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load page views.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const health = data?.writeHealth;
  const maxDay = Math.max(1, ...(data?.days ?? []).map((d) => d.views));
  const daysWithViews = (data?.days ?? []).filter((d) => d.views > 0);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Page Views</h1>
          <p className="text-stone-400 mt-1 max-w-3xl">
            Counted on our own server, for every HTML page a person loads. Aggregate counts only —
            path and UTC day, no IP address, no user agent, no cookie, no third-party script.
          </p>
        </div>
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="shrink-0 px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-sm font-bold text-white disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl px-5 py-3 text-xs font-mono text-rose-300">
          Couldn't load page views — {error}. Nothing is shown rather than a guess.
        </div>
      )}

      {data?.readError && (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl px-5 py-3 text-xs font-mono text-rose-300">
          The counter's store could not be READ ({data.readError}). The numbers below are not
          trustworthy until that file is repaired or replaced.
        </div>
      )}

      {health && !health.ok && (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl px-5 py-3 text-sm text-rose-200">
          <p className="font-bold">
            Counting has been failing since {fmtUtc(health.failingSince)}.
          </p>
          <p className="text-xs mt-1 font-mono text-rose-300">
            {health.consecutiveFailures} consecutive failed write(s) · {health.pendingInMemory} view(s)
            held in memory only · last error: {health.lastError ?? "unknown"}
          </p>
          <p className="text-xs mt-2 text-rose-300/80">
            Pages are still being served — a failed count never breaks a page. But views counted
            while the store is unwritable are lost if the server restarts.
          </p>
        </div>
      )}

      {health && health.ok && health.lastRecoveredAt && (
        <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl px-5 py-3 text-xs font-mono text-emerald-300">
          Counting recovered at {fmtUtc(health.lastRecoveredAt)} after an earlier failure.
        </div>
      )}

      {data?.location && (
        <div
          className={
            data.location.insidePublishTree || !data.location.writable
              ? "bg-red-950/30 border border-red-500/40 rounded-xl px-5 py-3 text-xs font-mono text-red-200"
              : "bg-stone-900 border border-stone-800 rounded-xl px-5 py-3 text-xs font-mono text-stone-400"
          }
          data-testid="page-views-counter-location"
        >
          <div className="break-all">
            Counting to <span className="text-stone-200">{data.location.counterFile}</span>
          </div>
          <div className="mt-1">
            data dir {data.location.dataDir} ·{" "}
            {data.location.insidePublishTree
              ? "INSIDE THE PUBLISH TREE — a deploy can discard this history"
              : "outside the publish tree"}{" "}
            · {data.location.writable ? "writable" : "NOT WRITABLE by this process"} ·{" "}
            {data.location.fileExists
              ? `file present, ${data.location.bytes ?? 0} bytes, last write ${fmtUtc(data.location.lastWriteAt)}`
              : "file not created yet"}
          </div>
        </div>
      )}

      {data && !data.hasAnyData && (
        <div className="bg-stone-900 border border-stone-800 rounded-xl px-6 py-8 text-center">
          <p className="text-lg font-bold text-white">Nothing recorded yet.</p>
          <p className="text-stone-400 text-sm mt-2 max-w-2xl mx-auto">
            The counter has not stored a single page view. That is the honest state of the store —
            it is not a zero standing in for missing data. It becomes non-empty on the first
            successful HTML page load after this deployment, and it will say so here.
          </p>
        </div>
      )}

      {data && data.hasAnyData && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
              <div className="text-2xl font-black text-emerald-400">{data.totalViews.toLocaleString()}</div>
              <div className="text-stone-500 text-xs font-mono mt-1">Views, last {data.windowDays} days</div>
            </div>
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
              <div className="text-2xl font-black text-white">{data.uniquePaths.toLocaleString()}</div>
              <div className="text-stone-500 text-xs font-mono mt-1">Distinct paths in window</div>
            </div>
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
              <div className="text-2xl font-black text-blue-400">{daysWithViews.length}</div>
              <div className="text-stone-500 text-xs font-mono mt-1">Days with at least one view</div>
            </div>
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-4">
              <div className="text-2xl font-black text-amber-400">{data.storedDays}</div>
              <div className="text-stone-500 text-xs font-mono mt-1">
                Days stored (kept {data.retentionDays})
              </div>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <h2 className="text-sm font-black uppercase tracking-wider text-stone-400 mb-1">Views per day</h2>
            <p className="text-xs text-stone-500 mb-4 font-mono">
              {data.windowStart} → {data.windowEnd} · UTC days
            </p>
            {data.totalViews === 0 ? (
              <p className="text-stone-400 text-sm">
                No views recorded in this window. The store holds {data.storedDays} day(s) of data
                older than it.
              </p>
            ) : (
              <div className="flex items-end gap-1 h-32" role="img" aria-label="Page views per UTC day">
                {data.days.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.day}: ${d.views}`}>
                    <div
                      className={`w-full rounded-t ${d.views > 0 ? "bg-emerald-500" : "bg-stone-800"}`}
                      style={{ height: `${Math.max(d.views > 0 ? 6 : 2, Math.round((d.views / maxDay) * 100))}%` }}
                    />
                  </div>
                ))}
              </div>
            )}
            {data.days.length > 0 && (
              <div className="flex justify-between text-[10px] font-mono text-stone-600 mt-2">
                <span>{data.days[0]?.day}</span>
                <span>{data.days[data.days.length - 1]?.day}</span>
              </div>
            )}
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-800">
              <h2 className="text-sm font-black uppercase tracking-wider text-stone-400">
                Top {data.topPaths.length} path{data.topPaths.length === 1 ? "" : "s"}
              </h2>
              <p className="text-xs text-stone-500 font-mono mt-1">
                Last {data.windowDays} days · ranked by views
              </p>
            </div>
            {data.topPaths.length === 0 ? (
              <p className="px-5 py-6 text-sm text-stone-400">No views in this window.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-stone-500 font-mono">
                    <th className="text-left px-5 py-2">Path</th>
                    <th className="text-right px-5 py-2">Views</th>
                    <th className="text-right px-5 py-2">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPaths.map((row) => (
                    <tr key={row.path} className="border-t border-stone-800/70">
                      <td className="px-5 py-2 font-mono text-stone-200 break-all">{row.path}</td>
                      <td className="px-5 py-2 text-right font-bold text-emerald-400">{row.views.toLocaleString()}</td>
                      <td className="px-5 py-2 text-right font-mono text-stone-500">
                        {data.totalViews > 0 ? `${Math.round((row.views / data.totalViews) * 1000) / 10}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="text-[11px] font-mono text-stone-600 space-y-1">
        <p>Last successful write: {fmtUtc(health?.lastFlushAt ?? null)}</p>
        <p>
          Counted at the server, once per successful HTML page load. Bots and crawlers are dropped
          before anything is stored; assets, API calls and 404s are never counted.
        </p>
      </div>
    </div>
  );
}

export default AdminPageViewsPage;
