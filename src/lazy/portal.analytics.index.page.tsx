import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Button, PageHeader } from "~/components/ui";
import { PortalEmptyState } from "~/components/PortalEmptyState";
import {
  WINDOW_ALL_MS,
  deriveDashboard,
  usePortalDashboard,
} from "~/lib/portal-dashboard";

/**
 * Workspace Analytics — /portal/analytics (P2-5). Replaces the old analytics
 * page, which fetched a data-layer route that has no server handler (silent
 * SPA-200) and promised fabricated outputs — labor-cost claims, investment-
 * return-tracker claims, department-category breakdowns, and model execution
 * stats. This surface now shows ONLY real counts derived from the tenant's
 * actual records via the same live read endpoints as the Activity Hub (see
 * src/lib/portal-dashboard.ts). No estimates or projections: hours, savings,
 * and percentages are never computed because there is no honest source for
 * them. Portal-only.
 */

function WorkspaceAnalytics() {
  const { inputs, signedOut, loading, loaded, readError, updatedAt, refreshDashboard } = usePortalDashboard();

  // Analytics is all-time — every record with a known timestamp, no windowing.
  const d = useMemo(() => deriveDashboard(inputs, Date.now(), WINDOW_ALL_MS), [inputs]);

  // Honest refresh — re-pulls the SAME real dashboard sources as the Activity
  // Hub (see src/lib/portal-dashboard.ts): a true refetch via bounded reads,
  // nothing invented, nothing POSTed (no theater claim).
  async function loadAnalytics(): Promise<void> {
    await refreshDashboard();
  }

  const handleRefresh = async (): Promise<void> => {
    await loadAnalytics();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-10 h-10 border-2 border-stone-800 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-500 text-[10px] font-mono tracking-widest uppercase">Loading real counts…</p>
      </div>
    );
  }

  if (signedOut) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-stone-950 border border-stone-900 rounded-2xl p-8 text-center">
        <h1 className="text-lg font-bold text-white mb-2">Sign in to see your analytics.</h1>
        <p className="text-sm text-stone-400 mb-6">Workspace counts appear here once you're signed in.</p>
        <Link to="/login" className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold px-6 py-3 rounded-xl transition-all text-sm">
          Sign in
        </Link>
      </div>
    );
  }

  const operationsCards = [
    { label: "Approvals pending", value: d.approvals.pending, link: "/portal/approvals", sub: "awaiting a decision" },
    { label: "Approvals decided", value: d.approvals.decided, link: "/portal/approvals", sub: "all-time decisions" },
    { label: "Integrations connected", value: d.integrations.connected, link: "/portal/integrations", sub: "from your credentials" },
    { label: "Import lanes connected", value: d.lanes.wired, link: "/portal/import", sub: `of ${d.lanes.total} available lanes` },
    { label: "Task / run records", value: d.records.total, link: "/portal/workflows", sub: "tasks + workflow runs" },
    { label: "Completed records", value: d.records.completedInWindow, link: "/portal/workflows", sub: "status: completed" },
  ] as const;

  const quoteCards = [
    { label: "Proposals awaiting review", value: d.quotes.proposals.awaitingReview, link: "/portal/proposals" },
    { label: "Proposals approved", value: d.quotes.proposals.approved, link: "/portal/proposals" },
    { label: "Proposals declined", value: d.quotes.proposals.declined, link: "/portal/proposals" },
    { label: "Invoices sent", value: d.quotes.invoicesSent, link: "/portal/invoices" },
    { label: "Deal rooms to open", value: d.quotes.dealRooms.draft, link: "/portal/deal-rooms" },
  ] as const;

  return (
    <div className="space-y-8 max-w-6xl mx-auto text-stone-100">

      {/* ─── Header ─── */}
      <PageHeader
        title={<>Workspace Analytics</>}
        subtitle={
          <>
            Real counts from your workspace's records — approvals, tasks and workflow runs, integrations, and
            quote-to-cash. No estimates or projections.
          </>
        }
        actions={
          <Button variant="secondary" onClick={() => void handleRefresh()}>
            Refresh
          </Button>
        }
      />

      {readError && (
        <div
          role="alert"
          className="bg-rose-950/20 border border-rose-500/30 rounded-xl px-5 py-3 text-xs font-mono text-rose-300"
        >
          {readError.signedOut
            ? "Your session is not active — sign in again to see your analytics."
            : `Could not read your workspace counts${
                readError.sources.length > 1 ? ` (${readError.sources.length} sources)` : ""
              }: ${readError.error}`}
        </div>
      )}

      {d.isEmpty ? (
        loaded ? (
          <div className="max-w-xl mx-auto my-8">
            <PortalEmptyState
              title="No activity yet in this workspace"
              body="Counts here come from your workspace's real records — approvals, tasks and workflow runs, integrations, and quote-to-cash. They appear as you use the platform, starting with bringing your data in."
              action={{ label: "Bring your data in", to: "/portal/import" }}
            />
          </div>
        ) : (
          <div className="max-w-xl mx-auto my-8">
            {/* SLICE 183 — "no activity yet" over a read that failed is the lie
                this slice removes: the empty state renders only on a full 2xx. */}
            <p className="text-sm text-stone-400 text-center">
              Your workspace counts could not be read — see the notice above. Nothing here is an
              empty workspace.
            </p>
          </div>
        )
      ) : (
        <>
          {/* ─── Operations ─── */}
          <section className="space-y-4">
            <h2 className="text-sm font-black tracking-tight text-white">Operations</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {operationsCards.map((c) => (
                <Link
                  key={c.label}
                  to={c.link}
                  className="bg-stone-950 border border-stone-900 rounded-xl p-5 flex flex-col justify-between gap-3 hover:border-stone-700 transition-colors"
                >
                  <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-bold">{c.label}</span>
                  <div>
                    <p className="text-2xl font-black text-white">{c.value}</p>
                    <span className="text-[10px] text-stone-500 font-mono">{c.sub}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* ─── Quote-to-cash ─── */}
          <section className="space-y-4">
            <h2 className="text-sm font-black tracking-tight text-white">Quote-to-cash</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {quoteCards.map((c) => (
                <Link
                  key={c.label}
                  to={c.link}
                  className="bg-stone-950 border border-stone-900 rounded-xl p-5 flex flex-col justify-between gap-3 hover:border-stone-700 transition-colors"
                >
                  <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-bold">{c.label}</span>
                  <p className="text-2xl font-black text-white">{c.value}</p>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ─── Honest refresh note ─── */}
      <p className="text-center text-[10px] font-mono text-stone-600 pt-2">
        {updatedAt != null
          ? `Data refreshes every 30 seconds · Last refreshed ${new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
          : "Data refreshes every 30 seconds."}
      </p>

    </div>
  );
}

export default WorkspaceAnalytics;