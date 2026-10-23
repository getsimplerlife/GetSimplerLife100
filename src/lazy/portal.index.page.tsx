import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AnimatedNumber } from "~/components/ui";
import { usePortalContext } from "~/routes/portal.context";
import {
  DASHBOARD_WINDOW_MS,
  deriveDashboard,
  usePortalDashboard,
  type DashboardTimeFilter,
} from "~/lib/portal-dashboard";

/**
 * Activity Hub — /portal home. P2-5: every counter on this page derives from
 * real tenant-scoped read endpoints (see src/lib/portal-dashboard.ts). No
 * hard-coded KPI numbers, no placeholder rows, no fake trends: empty stores
 * produce honest zeros + empty states, and a missing session renders an
 * honest "Sign in" panel. The Quick Approve/Reject lanes POST to the real
 * approval-queue endpoint and only ever report what the response actually
 * says (no success theater). Portal-only; zero server/auth changes.
 */

type TimeFilter = DashboardTimeFilter;

function ActivityHubDashboard() {
  const { userEmail } = usePortalContext();
  const { inputs, signedOut, loading, error, updatedAt, refreshDashboard } = usePortalDashboard();

  const [timeFilter, setTimeFilter] = useState<TimeFilter>("24h");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const derived = useMemo(
    () => deriveDashboard(inputs, Date.now(), DASHBOARD_WINDOW_MS[timeFilter]),
    [inputs, timeFilter],
  );

  const totalFilteredTasks = derived.records.inWindow;
  const tasksCompleted = derived.records.completedInWindow;
  const pendingApprovals = derived.approvals.pending;
  const hasActionItems = pendingApprovals > 0;

  // ── Onboarding (derived from real stores only) ─────────────────────────────
  const isNewUser = derived.integrations.connected === 0 && derived.records.total === 0;
  const onboardingSteps = [
    { label: "Connect at least one integration", done: derived.integrations.connected > 0, link: "/portal/integrations" as const },
    { label: "Run your first workflow", done: derived.records.total > 0, link: "/portal/workflows" as const },
    { label: "Review the approval queue", done: derived.approvals.pending > 0, link: "/portal/approvals" as const },
  ];
  const onboardingProgress = onboardingSteps.filter((s) => s.done).length;

  // ── Approval decisions — real queue, honest outcomes ──────────────────────
  const handleApprovalAction = async (actionId: string, action: "approve" | "reject") => {
    setFeedback({ kind: "ok", text: `Sending ${action}…` });
    try {
      const res = await fetch("/api/portal/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ actionId, decision: action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFeedback({
          kind: "error",
          text: `Couldn't ${action} — ${typeof body?.error === "string" ? body.error : "the action's state changed"}. Approvals shows the current state.`,
        });
      } else {
        const exec = body?.data?.execution;
        if (action === "approve" && exec && exec.success === false) {
          setFeedback({ kind: "error", text: `Approved, but execution failed: ${exec.error ?? "unknown error"}. See Approvals.` });
        } else {
          setFeedback({ kind: "ok", text: action === "approve" ? "Approved." : "Rejected." });
        }
      }
      // Always resync from the real queue (never trust the optimistic copy).
      void refreshDashboard();
    } catch {
      setFeedback({ kind: "error", text: "Request failed — check your connection and try again." });
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  // ── Loading (skeleton) ─────────────────────────────────────────────────────

  const SkeletonBox = ({ className = "" }: { className?: string }) => (
    <div className={`bg-stone-900/60 rounded-lg animate-pulse ${className}`} />
  );

  if (loading) {
    return (
      <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">
        <div className="space-y-4">
          <SkeletonBox className="w-32 h-3 rounded" />
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-2">
              <SkeletonBox className="w-72 h-8 rounded" />
              <SkeletonBox className="w-96 h-4 rounded" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-stone-950 border border-stone-900 rounded-2xl p-5 space-y-3">
              <SkeletonBox className="w-20 h-3 rounded" />
              <SkeletonBox className="w-16 h-8 rounded" />
              <SkeletonBox className="w-28 h-3 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-6 space-y-4">
          <SkeletonBox className="w-32 h-4 rounded" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-stone-900/50 last:border-0">
              <SkeletonBox className="w-8 h-8 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <SkeletonBox className="w-3/4 h-3 rounded" />
                <SkeletonBox className="w-1/2 h-2.5 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (signedOut) {
    return (
      <div className="max-w-xl mx-auto mt-16 bg-stone-950 border border-stone-900 rounded-2xl p-8 text-center">
        <h1 className="text-lg font-bold text-white mb-2">Sign in to see your dashboard.</h1>
        <p className="text-sm text-stone-400 mb-6">Your workspace activity and approvals show here once you're signed in.</p>
        <Link to="/login" className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-extrabold px-6 py-3 rounded-xl transition-all text-sm">
          Sign in
        </Link>
      </div>
    );
  }

  const firstName = userEmail ? userEmail.split("@")[0] : "there";
  const timeLabel = timeFilter === "24h" ? "today" : timeFilter === "7d" ? "this week" : "this month";

  return (
    <div className="space-y-8 text-stone-100 max-w-6xl mx-auto">

      {/* ── Hero Header ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">Activity Hub</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              Good {new Date().getHours() < 12 ? "Morning" : new Date().getHours() < 18 ? "Afternoon" : "Evening"}, {firstName}.
            </h1>
            <p className="text-stone-400 text-sm mt-1 max-w-xl leading-relaxed">
              {totalFilteredTasks > 0
                ? `You have ${totalFilteredTasks} task or workflow run record${totalFilteredTasks === 1 ? "" : "s"} ${timeLabel}.`
                : "Your workspace — approvals, tasks, workflow runs, and integrations at a glance."}
            </p>
          </div>
          {/* Time filter toggles */}
          <div className="flex items-center gap-1 bg-stone-950 border border-stone-900 rounded-xl p-1 shrink-0">
            {(["24h", "7d", "30d"] as TimeFilter[]).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  timeFilter === tf
                    ? "bg-stone-800 text-white"
                    : "text-stone-500 hover:text-stone-300"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Action-Needed Banner ────────────────────────────────── */}
      {hasActionItems && (
        <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <span className="font-bold text-amber-400 text-sm">Action Needed</span>
              <span className="text-stone-400 text-xs ml-3">
                {pendingApprovals > 0 && `${pendingApprovals} approval${pendingApprovals > 1 ? "s" : ""} pending`}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {pendingApprovals > 0 && (
              <button onClick={() => document.getElementById("approvals-section")?.scrollIntoView({ behavior: "smooth" })}
                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all">
                Review Approvals
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Onboarding checklist for new users ──────────────────── */}
      {isNewUser && (
        <div className="bg-stone-950 border border-stone-900 rounded-2xl p-8 text-center max-w-xl mx-auto">
          <div className="text-4xl mb-4">🚀</div>
          <h3 className="text-lg font-bold text-white mb-2">Welcome to Simpler Life 100</h3>
          <p className="text-sm text-stone-400 mb-6 max-w-sm mx-auto leading-relaxed">
            Your workspace is ready — bring your existing data in (connect your tools once to transfer it), then run everything from here. Here's how to get started:
          </p>
          <div className="space-y-3 text-left max-w-xs mx-auto mb-6">
            {onboardingSteps.map((step, i) => (
              <Link key={i} to={step.link}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                  step.done
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 line-through opacity-60"
                    : "bg-stone-900 border border-stone-800 text-stone-200 hover:border-stone-700 hover:bg-stone-800"
                }`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                  step.done ? "bg-emerald-500/20 text-emerald-400" : "bg-stone-800 text-stone-400"
                }`}>{step.done ? "✓" : i + 1}</span>
                {step.label}
              </Link>
            ))}
          </div>
          <Link to="/portal/import"
            className="inline-flex items-center justify-center bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold px-6 py-3 rounded-xl transition-all font-mono text-xs shadow-lg active:scale-95">
            📥 Bring your data in — connect your first tool
          </Link>
        </div>
      )}

      {/* ── Hero Metrics (derived from real stores) ──────────────── */}
      {!isNewUser && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Approvals", value: String(pendingApprovals), subtitle: `${derived.approvals.decided} decided`, color: "text-purple-400", bg: "bg-purple-500/5 border-purple-500/20" },
            { label: "Integrations", value: String(derived.integrations.connected), subtitle: "connected", color: "text-blue-400", bg: "bg-blue-500/5 border-blue-500/20" },
            { label: "Activity", value: String(totalFilteredTasks), subtitle: `records ${timeLabel}`, color: "text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/20" },
            { label: "Completed", value: String(tasksCompleted), subtitle: `records ${timeLabel}`, color: "text-amber-400", bg: "bg-amber-500/5 border-amber-500/20" },
          ].map((m, i) => (
            <div key={i} className={`rounded-xl border p-5 ${m.bg} flex flex-col justify-between gap-3`}>
              <span className="text-[10px] font-mono uppercase tracking-widest text-stone-500 font-bold">{m.label}</span>
              <div>
                <p className={`text-2xl font-black ${m.color}`}><AnimatedNumber value={m.value} /></p>
                <span className="text-[10px] text-stone-500 font-mono">{m.subtitle}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main Grid ───────────────────────────────────────────── */}
      {!isNewUser && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left: Activity Feed */}
          <div className="lg:col-span-2 space-y-8">

            <div className="space-y-4">
              <h2 className="text-sm font-black tracking-tight text-white">⚡ Activity Feed</h2>
              <div className="bg-stone-950 border border-stone-900 rounded-xl divide-y divide-stone-900 overflow-hidden">
                {derived.recent.length === 0 ? (
                  <div className="p-6 text-center text-stone-500 text-xs">
                    No task or workflow run records {timeLabel}.
                  </div>
                ) : (
                  derived.recent.map((item, idx) => (
                    <div key={idx} className="p-4 hover:bg-stone-900/30 transition-colors flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`shrink-0 text-[10px] ${item.status === "completed" ? "text-emerald-500" : "text-blue-400"}`}>
                          {item.status === "completed" ? "✓" : "⚡"}
                        </span>
                        <div className="min-w-0">
                          <span className={`font-bold text-white text-[11px] ${item.status === "completed" ? "text-emerald-400" : "text-blue-400"}`}>
                            {item.status || "run"}
                          </span>
                          <span className="text-stone-600 mx-1.5 text-[10px]">•</span>
                          <span className="text-stone-400 text-[11px] truncate">{item.summary || "No summary recorded"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-stone-600 text-[10px] font-mono">
                          {item.at ? new Date(item.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* Right: Sidebar widgets */}
          <div className="space-y-6" id="approvals-section">

            {/* Pending Approvals */}
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-white">📥 Pending Approvals</h3>
                {pendingApprovals > 0 && (
                  <span className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-500/20">{pendingApprovals}</span>
                )}
              </div>
              {derived.approvals.pending === 0 ? (
                <div className="text-center py-6">
                  <div className="text-xl mb-1">🎉</div>
                  <p className="text-[10px] font-bold text-stone-400">All clear</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {inputs.approvals.pending.slice(0, 3).map((app: any, i: number) => (
                    <div key={app.actionId ?? i} className="bg-stone-900/50 border border-stone-800 rounded-lg p-3 space-y-2">
                      <div className="flex justify-between text-[10px] font-mono">
                        <span className="text-stone-500 truncate">{String(app.actionId ?? "PENDING").slice(0, 12)}</span>
                        <span className="text-blue-400">{app.provider || "unknown"}</span>
                      </div>
                      <p className="text-[10px] font-bold text-white leading-snug">{app.actionType}</p>
                      <p className="text-[10px] text-stone-400 leading-relaxed bg-stone-950 rounded-lg p-2">{(app.summary?.what || "No details") + (app.summary?.where ? " → " + app.summary.where : "")}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button onClick={() => handleApprovalAction(app.actionId, "approve")}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold py-1.5 rounded-lg transition-all">Approve</button>
                        <button onClick={() => handleApprovalAction(app.actionId, "reject")}
                          className="bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold py-1.5 rounded-lg border border-stone-700 transition-all">Reject</button>
                      </div>
                    </div>
                  ))}
                  {inputs.approvals.pending.length > 3 && (
                    <Link to="/portal/approvals" className="block text-center text-[10px] font-mono text-blue-400 hover:text-blue-300 pt-1">
                      +{inputs.approvals.pending.length - 3} more →
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Billing — real subscription state (P1-1 native billing) */}
            {derived.billing.hasSubscription ? (
              <div className="bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">💳 Active Plan</span>
                <p className="text-[10px] text-stone-400 leading-relaxed">
                  {derived.billing.planName
                    ? `${derived.billing.planName}${derived.billing.interval ? ` (${derived.billing.interval})` : ""} — ` : ""}
                  {derived.billing.invoices} invoice{derived.billing.invoices === 1 ? "" : "s"} on record.
                </p>
                <Link to="/portal/billing"
                  className="block text-center text-[10px] font-bold bg-stone-800 hover:bg-stone-700 text-stone-200 py-2 rounded-lg border border-stone-700 transition-all">
                  View Billing →
                </Link>
              </div>
            ) : (
              !isNewUser && (
                <div className="bg-blue-950/20 border border-blue-900/30 rounded-xl p-4 space-y-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400 font-bold">💳 Billing</span>
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    No active plan on file. Your workspace keeps running — pick a tier in Billing when you're ready.
                  </p>
                  <Link to="/portal/billing"
                    className="block text-center text-[10px] font-bold bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg transition-all">
                    View plans
                  </Link>
                </div>
              )
            )}

            {/* Quote-to-cash — real native proposals / invoices / deal rooms */}
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-3">
              <h3 className="text-xs font-black text-white">Quote to cash</h3>
              <div className="space-y-2">
                <Link to="/portal/proposals" className="flex items-center justify-between text-[10px] text-stone-400 hover:text-white transition-colors py-1">
                  <span className="font-mono">{derived.quotes.proposals.awaitingReview} proposal{derived.quotes.proposals.awaitingReview === 1 ? "" : "s"} awaiting review</span>
                  <span className="text-stone-600">→</span>
                </Link>
                <Link to="/portal/invoices" className="flex items-center justify-between text-[10px] text-stone-400 hover:text-white transition-colors py-1">
                  <span className="font-mono">{derived.quotes.invoicesSent} invoice{derived.quotes.invoicesSent === 1 ? "" : "s"} sent</span>
                  <span className="text-stone-600">→</span>
                </Link>
                <Link to="/portal/deal-rooms" className="flex items-center justify-between text-[10px] text-stone-400 hover:text-white transition-colors py-1">
                  <span className="font-mono">{derived.quotes.dealRooms.draft} deal room{derived.quotes.dealRooms.draft === 1 ? "" : "s"} to open</span>
                  <span className="text-stone-600">→</span>
                </Link>
              </div>
              <p className="text-[10px] text-stone-500 leading-relaxed">
                Counts from your workspace's real proposals, invoices, and deal rooms. Nothing in flight? New records will appear here as you work.
              </p>
            </div>

            {/* Bring your data in — client-side, one-shot transfers */}
            <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-4">
              <h3 className="text-xs font-black text-white">🔌 Your tool connections</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-stone-400 font-mono">Import lanes (catalog)</span>
                  <span className="text-[10px] font-bold text-white">{derived.lanes.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-stone-400 font-mono">Lanes you've connected</span>
                  <span className="text-[10px] font-bold text-emerald-400">{derived.lanes.wired}</span>
                </div>
              </div>
              <p className="text-[10px] text-stone-400 leading-relaxed">
                Connect your existing tools to bring your data in — one-time, client-initiated transfers.
                Preview before anything changes; nothing is imported until you approve.
              </p>
              <Link to="/portal/import"
                className="block text-center text-[10px] font-bold bg-stone-800 hover:bg-stone-700 text-stone-200 py-2 rounded-lg border border-stone-700 transition-all">
                Open Import &amp; migration →
              </Link>
            </div>

            {/* Onboarding progress (returning users with incomplete setup) */}
            {onboardingProgress < 3 && (
              <div className="bg-stone-950 border border-stone-900 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-white">🚀 Setup Progress</h3>
                  <span className="text-[10px] font-mono text-stone-500">{onboardingProgress}/3</span>
                </div>
                <div className="w-full bg-stone-900 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-full rounded-full transition-all"
                    style={{ width: `${(onboardingProgress / 3) * 100}%` }} />
                </div>
                <div className="space-y-1">
                  {onboardingSteps.filter((s) => !s.done).slice(0, 2).map((step, i) => (
                    <Link key={i} to={step.link}
                      className="flex items-center gap-2 text-[10px] text-stone-400 hover:text-white transition-colors py-1">
                      <span className="w-4 h-4 rounded-full bg-stone-800 flex items-center justify-center text-[10px] text-stone-500 shrink-0">{i + 1}</span>
                      {step.label} →
                    </Link>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ── Honest status / feedback ─────────────────────────────── */}
      {error && (
        <div className="fixed bottom-20 right-6 bg-stone-900 border border-rose-500/30 text-rose-300 px-5 py-3 rounded-xl z-50 font-mono text-xs max-w-sm">
          Couldn't refresh dashboard data — showing the last loaded values.
        </div>
      )}

      {feedback && (
        <div className={`fixed bottom-6 right-6 border px-5 py-3 rounded-xl shadow-xl z-50 flex items-center gap-3 animate-slideUp font-mono text-xs ${
          feedback.kind === "error"
            ? "bg-stone-900 border-rose-500/30 text-rose-300"
            : "bg-stone-900 border-emerald-500/40 text-emerald-300"
        }`}>
          <span className={feedback.kind === "error" ? "text-rose-400" : "text-emerald-400"}>
            {feedback.kind === "error" ? "✕" : "✓"}
          </span>
          <span className="font-bold">{feedback.text}</span>
        </div>
      )}

      {/* last-refreshed hint (only when we have a real timestamp) */}
      {updatedAt != null && (
        <div className="text-center text-[10px] font-mono text-stone-600 pt-2">
          Data refreshes every 30 seconds · Last refreshed {new Date(updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
        </div>
      )}

    </div>
  );
}

export default ActivityHubDashboard;