import { useCallback, useEffect, useState } from "react";

/**
 * Admin — Data Health — /portal/admin/data-health (SLICE 162).
 *
 * The one screen that answers "did our data survive the last publish?" — the
 * question the plan promises clients an answer to. Every value comes from the
 * owner-gated `GET /api/admin/data-health`, which the RUNNING server builds from
 * the filesystem: the generation marker inside its own data directory, and a
 * stat of every declared durable store.
 *
 * WHAT MAKES IT GREEN: the marker's firstSeenAt is older than BOTH this process
 * and the running build, and the data directory is outside the publish tree.
 * RED: the directory is inside the tree a publish replaces, or the marker is
 * newer than the running build (i.e. the directory was created after the code
 * that is serving now — a publish or a wipe replaced it).
 *
 * Nothing here is inferred from an env var or a config value, and an unreadable
 * marker shows as red rather than as a cheerful green. When the server cannot
 * say, the page says "unknown" and shows the raw facts instead of a guess.
 */
interface StoreRow {
  store: string;
  kind: "file" | "directory";
  present: boolean;
  bytes: number | null;
  mtime: string | null;
  entries: number | null;
  truncated: boolean;
  error: string | null;
}

interface DataHealth {
  ok: boolean;
  verdict: "green" | "red" | "unknown";
  reasons: string[];
  dataDir: string;
  rawDataDir: string | null;
  relocated: boolean;
  insidePublishTree: boolean;
  serverBase: string;
  processStartedAt: string;
  processUptimeSeconds: number;
  runningBuildAt: string | null;
  runningBuildAtSource: string | null;
  buildArtifacts: { path: string; mtime: string | null; present: boolean }[];
  runningBuildId: string | null;
  marker: {
    path: string;
    present: boolean;
    insideDataDir: boolean;
    insidePublishTree: boolean;
    firstSeenAt: string | null;
    lastBootAt: string | null;
    boots: number | null;
    buildsSeen: number;
    corruptPrevious: boolean;
    error: string | null;
  };
  survivedProcessStart: boolean | null;
  survivedRunningBuild: boolean | null;
  distinctBuilds: number;
  durableStores: { declared: number; present: number; missing: string[]; rows: StoreRow[] };
  checkedAt: string;
}

/** "2026-10-31T09:12:04.123Z" → "2026-10-31 09:12 UTC" (never a local guess). */
function fmtUtc(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function fmtUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

const VERDICT_STYLE: Record<DataHealth["verdict"], { card: string; dot: string; label: string }> = {
  green: {
    card: "bg-emerald-950/20 border-emerald-500/30",
    dot: "bg-emerald-400",
    label: "Data is outside the publish tree and provably survived",
  },
  red: {
    card: "bg-rose-950/20 border-rose-500/30",
    dot: "bg-rose-400",
    label: "Not durable — this deployment cannot prove its data survived",
  },
  unknown: {
    card: "bg-amber-950/20 border-amber-500/30",
    dot: "bg-amber-400",
    label: "Unknown — the server could not make the comparison",
  },
};

function AdminDataHealthPage() {
  const [data, setData] = useState<DataHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent: boolean) => {
    if (silent) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/data-health", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json().catch(() => null)) as DataHealth | null;
      if (!body || typeof body.dataDir !== "string" || !body.marker) {
        throw new Error("unexpected response shape");
      }
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load data health.");
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

  const style = data ? VERDICT_STYLE[data.verdict] : VERDICT_STYLE.unknown;
  const stores = data?.durableStores.rows ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Data Health</h1>
          <p className="text-stone-400 mt-1 max-w-3xl">
            Where this deployment writes, whether that location is inside the tree a publish
            replaces, and whether the data in it has already outlived a publish. Read from the
            filesystem by the running server — not from a config value.
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
          Couldn't load data health — {error}. Nothing is shown rather than a guess.
        </div>
      )}

      {data && (
        <>
          <div className={`border rounded-xl px-5 py-4 ${style.card}`}>
            <div className="flex items-center gap-3">
              <span className={`inline-block w-3 h-3 rounded-full ${style.dot}`} />
              <p className="font-bold text-white">
                {data.verdict === "green" ? "Green" : data.verdict === "red" ? "Red" : "Unknown"} —{" "}
                {style.label}
              </p>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-stone-300">
              {data.reasons.map((r, i) => (
                <li key={i} className="leading-relaxed">
                  · {r}
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Where the data lives</h2>
              <dl className="space-y-2 text-xs font-mono">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">DATA_DIR</dt>
                  <dd className="text-stone-200 break-all text-right">{data.dataDir}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">inside publish tree</dt>
                  <dd className={data.insidePublishTree ? "text-rose-300" : "text-emerald-300"}>
                    {String(data.insidePublishTree)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">relocated by policy</dt>
                  <dd className="text-stone-200">{String(data.relocated)}</dd>
                </div>
                {data.relocated && data.rawDataDir && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-stone-500">started from</dt>
                    <dd className="text-stone-400 break-all text-right">{data.rawDataDir}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">server base</dt>
                  <dd className="text-stone-400 break-all text-right">{data.serverBase}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">process started</dt>
                  <dd className="text-stone-200">{fmtUtc(data.processStartedAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">uptime</dt>
                  <dd className="text-stone-200">{fmtUptime(data.processUptimeSeconds)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">running build</dt>
                  <dd className="text-stone-200">{fmtUtc(data.runningBuildAt)}</dd>
                </div>
              </dl>
            </div>

            <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
              <h2 className="text-sm font-bold text-white mb-3">Generation marker</h2>
              <dl className="space-y-2 text-xs font-mono">
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">file</dt>
                  <dd className="text-stone-200 break-all text-right">{data.marker.path}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">present</dt>
                  <dd className={data.marker.present ? "text-emerald-300" : "text-rose-300"}>
                    {String(data.marker.present)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">first seen</dt>
                  <dd className="text-stone-200">{fmtUtc(data.marker.firstSeenAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">last boot</dt>
                  <dd className="text-stone-200">{fmtUtc(data.marker.lastBootAt)}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">boots recorded</dt>
                  <dd className="text-stone-200">{data.marker.boots ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">distinct builds seen</dt>
                  <dd className="text-stone-200">{data.distinctBuilds}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">predates this process</dt>
                  <dd className={data.survivedProcessStart ? "text-emerald-300" : "text-rose-300"}>
                    {data.survivedProcessStart === null ? "unknown" : String(data.survivedProcessStart)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-stone-500">predates running build</dt>
                  <dd className={data.survivedRunningBuild ? "text-emerald-300" : "text-rose-300"}>
                    {data.survivedRunningBuild === null ? "unknown" : String(data.survivedRunningBuild)}
                  </dd>
                </div>
                {data.marker.error && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-stone-500">read error</dt>
                    <dd className="text-rose-300 break-all text-right">{data.marker.error}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>

          <div className="bg-stone-900 border border-stone-800 rounded-xl p-5">
            <div className="flex items-baseline justify-between gap-4 mb-3">
              <h2 className="text-sm font-bold text-white">Durable stores on disk</h2>
              <p className="text-[11px] font-mono text-stone-500">
                {data.durableStores.present} of {data.durableStores.declared} declared stores present
              </p>
            </div>
            <p className="text-xs text-stone-400 mb-3">
              Every store this server can write, stat-ed in {data.dataDir}. A store that has never
              been written shows as absent — that is a fact, not a failure. The list is the same one
              the hourly archive asserts coverage against.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="text-stone-500 border-b border-stone-800">
                    <th className="text-left py-2 pr-4 font-normal">store</th>
                    <th className="text-right py-2 px-4 font-normal">bytes</th>
                    <th className="text-right py-2 px-4 font-normal">entries</th>
                    <th className="text-right py-2 pl-4 font-normal">last write</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.store} className="border-b border-stone-800/60">
                      <td className={s.present ? "py-1.5 pr-4 text-stone-200" : "py-1.5 pr-4 text-stone-600"}>
                        {s.store}
                        {s.truncated && <span className="text-amber-400"> (walk truncated)</span>}
                        {s.error && <span className="text-rose-400"> — {s.error}</span>}
                      </td>
                      <td className="py-1.5 px-4 text-right text-stone-300">{fmtBytes(s.bytes)}</td>
                      <td className="py-1.5 px-4 text-right text-stone-400">
                        {s.entries === null ? "—" : s.entries}
                      </td>
                      <td className="py-1.5 pl-4 text-right text-stone-400">{fmtUtc(s.mtime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-[11px] font-mono text-stone-600 space-y-1">
            <p>Checked {fmtUtc(data.checkedAt)} · running build id {data.runningBuildId ?? "unknown"}</p>
            <p>
              The marker is created on the first boot of a data directory and never reset by a later
              boot, so a firstSeenAt older than both the running process and the running build is
              proof the directory outlived the publish that deployed that build.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminDataHealthPage;
