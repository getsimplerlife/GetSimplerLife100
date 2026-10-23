import { useCallback, useEffect, useState } from "react";

/**
 * Admin Analytics — /portal/admin/analytics (P2-6 legacy sweep).
 * Owner-only view of real platform aggregates served by the owner-gated
 * "/api/admin/analytics" (403 for non-owners). The old page read its analytics
 * through the tenancy-scoped data-family endpoint and mapped the WRONG uptime
 * key, so "Uptime" always rendered as a dash; the card labels now match
 * exactly what the endpoint counts from the real stores. Per-account usage
 * breakdowns still don't exist yet, and that is stated honestly instead of
 * being invented. Portal-only; single load + manual refresh.
 */

type AdminStats = Record<string, string | number | undefined>;

function AdminAnalyticsPage() {
  const [stats, setStats] = useState<AdminStats>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent: boolean) => {
    if (silent) {
      setRefreshing(true);
    }
    try {
      const res = await fetch("/api/admin/analytics", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json().catch(() => ({}));
      const data = body?.data && typeof body.data === "object" ? (body.data as AdminStats) : {};
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const num = (v: string | number | undefined) => (typeof v === "number" ? v : undefined);
  const fmtUptime = (seconds?: number) => {
    if (seconds == null) return "—";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const cards = [
    { label: "Total Users", value: num(stats.totalUsers)?.toLocaleString() ?? "—", color: "text-white" },
    { label: "Automation Records", value: num(stats.totalAgents)?.toLocaleString() ?? "—", color: "text-emerald-400" },
    { label: "Run Records", value: num(stats.totalAgentRuns)?.toLocaleString() ?? "—", color: "text-blue-400" },
    { label: "Server Uptime", value: fmtUptime(num(stats.serverUptime)), color: "text-amber-400" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Platform Analytics</h1>
        <p className="text-stone-400 mt-1">
          Counts served from the platform's real stores (owner view). They show what the stores contain,
          not a projection of usage.
        </p>
      </div>

      {error && (
        <div className="bg-rose-950/20 border border-rose-500/30 rounded-xl px-5 py-3 text-xs font-mono text-rose-300">
          Couldn't load analytics — {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((s) => (
          <div key={s.label} className="bg-stone-950 border border-stone-900 rounded-xl p-4">
            <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
            <div className="text-stone-500 text-xs font-mono mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Breakdowns — honest placeholder (P1-2/P2-6): real per-account usage
          does not exist yet, and the old hardcoded API-usage bars + demo rows
          were removed. Nothing on this surface is invented. */}
      <div className="bg-stone-950 border border-stone-900 rounded-2xl p-8 text-center">
        <p className="text-xs text-stone-500">
          Per-account usage breakdowns aren't available yet — they'll appear here as accounts are used.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => void load(true)}
          disabled={refreshing}
          className="bg-stone-900 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white text-xs font-mono font-bold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>
    </div>
  );
}

export default AdminAnalyticsPage;