/**
 * portal-dashboard.ts — P2-5 honest dashboard KPIs (portal-only).
 *
 * ONE lib for the Activity Hub (/portal) + Workspace Analytics.
 * Every counter derives from REAL tenant-scoped read endpoints that the
 * prod-server actually serves:
 *
 *   approvals    /api/portal/approvals       approval-queue records (pending/decided)
 *   tasks        /api/data/tasks             tenant_tasks + workflow_runs records
 *   integrations /api/integrations          the OAuth credential store (live)
 *   import lanes /api/native/import/lanes    per-tenant lane wiring (catalog + wired)
 *   billing      /api/native/billing         P1-1 real subscription/invoice state
 *   quotes       /api/native/proposals, /api/native/invoice, /api/native/dealroom
 *
 * Nothing is invented: empty stores produce honest zeros and empty states —
 * never placeholder rows, never invented activity, never fabricated precision.
 * The previous surface read two dead/stale sources (the retired legacy
 * purchases route and the data-layer analytics route, which has NO server
 * handler and silently SPA-falls-back to 200 HTML) and parsed the real
 * `/api/data/tasks` contract WRONG (it looked for `timestamp`/`Completed`/
 * `result`; the served contract is `startedAt`/lowercased `status`/`summary`),
 * so real task and workflow-run records rendered as permanent zeros. This
 * module wires to the real contract and the live endpoints, derives every
 * count from the payloads, and is SSR-safe (the fetch effect only runs in the
 * browser; initial state is an honest empty dashboard).
 *
 * ZERO server/auth changes — reads only, all bounded, 30s polling.
 *
 * SLICE 183 — every read goes through `authedJson` (portal-primitives.ts).
 * This hook used to hand-roll `fetch` and coalesce with `|| []`, so a 401
 * or a 500 was indistinguishable from an empty workspace; the state now
 * carries `loaded` (every read 2xx) and `readError` (the server's own
 * sentence + the endpoints that failed), and pages gate their empty
 * states on `loaded`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toEpochMs } from "./portal-notifications";
import { authedJson } from "./portal-primitives";

// ── Window helpers (shared with the time-filter UI) ──────────────────────────

export type DashboardTimeFilter = "24h" | "7d" | "30d";

export const DASHBOARD_WINDOW_MS: Record<DashboardTimeFilter, number> = {
  "24h": 24 * 3600 * 1000,
  "7d": 7 * 24 * 3600 * 1000,
  "30d": 30 * 24 * 3600 * 1000,
};

/** Analytics uses all-time totals: every record with a known timestamp. */
export const WINDOW_ALL_MS = Number.POSITIVE_INFINITY;

// ── Payload views (portal-safe projections of the real contracts) ────────────

export interface DashboardInputs {
  /** approval-queue GET → { data: { pending, decided, mode } } */
  approvals: { pending: Record<string, unknown>[]; decided: Record<string, unknown>[] };
  /** /api/data/tasks GET → { data: [...] } — tenant_tasks + workflow_runs */
  taskRecords: Record<string, unknown>[];
  /** /api/integrations GET → { data: [...] } — OAuth credential store */
  integrations: Record<string, unknown>[];
  /** /api/native/import/lanes GET → { data: { lanes: [{ provider, wired }] } } */
  lanes: { provider?: string; wired?: boolean }[];
  /** /api/native/billing GET → { ok: true, billing: { source, subscription|null,
   *  invoices, paymentMethod } } — the view `native/billing/router.ts` returns at
   *  :279/:287. It is `billing`, NOT `data`; reading `data` here (SLICE 178) made
   *  the plan and invoice panel empty for every tenant, including a paying one. */
  billing: { subscription: Record<string, unknown> | null; invoices: Record<string, unknown>[] };
  /** /api/native/proposals GET → { data: [...] } */
  proposals: Record<string, unknown>[];
  /** /api/native/invoice GET → { data: [...] } */
  invoices: Record<string, unknown>[];
  /** /api/native/dealroom GET → { data: [...] } */
  dealRooms: Record<string, unknown>[];
}

export interface DashboardState {
  approvals: { pending: number; decided: number };
  records: { total: number; inWindow: number; completedInWindow: number };
  integrations: { connected: number };
  lanes: { total: number; wired: number };
  billing: {
    hasSubscription: boolean;
    planName: string | null;
    interval: string | null;
    invoices: number;
  };
  quotes: {
    proposals: { total: number; awaitingReview: number; approved: number; declined: number };
    invoicesSent: number;
    dealRooms: { draft: number; total: number };
  };
  /** Newest-first window-filtered activity (task/run records). */
  recent: Array<{ id: string; status: string; summary: string; at: number }>;
  /** Every source was empty AND no subscription/records — nothing to show. */
  isEmpty: boolean;
}

// ── Honest record parsing (matches the served /api/data/tasks contract) ──────

/** The served task/run record carries startedAt (or createdAt); tenant_tasks
 *  rows may carry timestamp/completedAt instead. Unknown time → 0 (excluded
 *  from dated windows rather than guessed). */
export function recordAt(item: Record<string, unknown>): number {
  return toEpochMs(
    (item.startedAt as number | string | undefined) ??
      (item.createdAt as number | string | undefined) ??
      (item.timestamp as number | string | undefined) ??
      (item.completedAt as number | string | undefined),
  );
}

/** Statuses are lowercased server-side; tenant_tasks rows may use any case. */
export function recordStatus(item: Record<string, unknown>): string {
  return String(item.status ?? "").toLowerCase();
}

/** Work-record narrative — the served summary field (output/summary upstream). */
export function recordSummary(item: Record<string, unknown>): string {
  const s = item.summary ?? item.result ?? item.output;
  return typeof s === "string" ? s : "";
}

// ── Pure derivations ──────────────────────────────────────────────────────────

function countInWindow(
  items: Record<string, unknown>[],
  windowMs: number,
  now: number,
): { inWindow: number; completedInWindow: number } {
  let inWindow = 0;
  let completedInWindow = 0;
  for (const item of items) {
    const at = recordAt(item);
    if (!at || now - at > windowMs) continue;
    inWindow += 1;
    if (recordStatus(item) === "completed") completedInWindow += 1;
  }
  return { inWindow, completedInWindow };
}

/** Newest-first activity rows, window-filtered, capped at `limit` (8). */
export function buildRecent(
  items: Record<string, unknown>[],
  windowMs: number,
  now: number,
  limit = 8,
): DashboardState["recent"] {
  const rows: DashboardState["recent"] = [];
  for (const item of items) {
    const at = recordAt(item);
    if (!at || now - at > windowMs) continue;
    rows.push({
      id: String(item.id ?? "") || `record-${rows.length}`,
      status: recordStatus(item),
      summary: recordSummary(item),
      at,
    });
  }
  rows.sort((a, b) => b.at - a.at);
  return rows.slice(0, limit);
}

/** Quote-to-cash buckets — statuses interpreted exactly like the P2-3
 *  notifications module (proposals sent|pending = awaiting review, rejected =
 *  declined, approved = approved; invoices other than draft = sent; deal rooms
 *  in draft = still to open). Unknown statuses are counted in totals only. */
export function deriveQuotes(
  proposals: Record<string, unknown>[],
  invoices: Record<string, unknown>[],
  dealRooms: Record<string, unknown>[],
): DashboardState["quotes"] {
  let awaitingReview = 0;
  let approved = 0;
  let declined = 0;
  for (const p of proposals) {
    const status = String(p.status ?? "").toLowerCase();
    if (status === "sent" || status === "pending") awaitingReview += 1;
    else if (status === "approved") approved += 1;
    else if (status === "rejected") declined += 1;
  }
  let invoicesSent = 0;
  for (const i of invoices) {
    const status = String(i.status ?? "").toLowerCase();
    if (status && status !== "draft") invoicesSent += 1;
  }
  let dealRoomsDraft = 0;
  for (const d of dealRooms) {
    if (String(d.status ?? "").toLowerCase() === "draft") dealRoomsDraft += 1;
  }
  return {
    proposals: {
      total: proposals.length,
      awaitingReview,
      approved,
      declined,
    },
    invoicesSent,
    dealRooms: { draft: dealRoomsDraft, total: dealRooms.length },
  };
}

/** Derive the whole honest dashboard from real payloads. `windowMs` only
 *  affects the record counters + activity feed; approval/integration/billing/
 *  quote totals are all-time. Unknown-timestamp records are excluded from
 *  dated windows (never bucketed by guesswork). */
export function deriveDashboard(
  inputs: DashboardInputs,
  now = Date.now(),
  windowMs: number = DASHBOARD_WINDOW_MS["7d"],
): DashboardState {
  const pending = (Array.isArray(inputs.approvals?.pending) ? inputs.approvals.pending : []).length;
  const decided = (Array.isArray(inputs.approvals?.decided) ? inputs.approvals.decided : []).length;
  const records = Array.isArray(inputs.taskRecords) ? inputs.taskRecords : [];
  const integrations = Array.isArray(inputs.integrations) ? inputs.integrations : [];
  const lanes = Array.isArray(inputs.lanes) ? inputs.lanes : [];
  const subscription = inputs.billing?.subscription ?? null;
  const invoices = Array.isArray(inputs.billing?.invoices) ? inputs.billing.invoices : [];
  const proposals = Array.isArray(inputs.proposals) ? inputs.proposals : [];
  const invoiceList = Array.isArray(inputs.invoices) ? inputs.invoices : [];
  const dealRooms = Array.isArray(inputs.dealRooms) ? inputs.dealRooms : [];

  const windowed = countInWindow(records, windowMs, now);

  const isEmpty =
    pending === 0 &&
    decided === 0 &&
    records.length === 0 &&
    integrations.length === 0 &&
    lanes.length === 0 &&
    !subscription &&
    invoices.length === 0 &&
    proposals.length === 0 &&
    invoiceList.length === 0 &&
    dealRooms.length === 0;

  return {
    approvals: { pending, decided },
    records: { total: records.length, ...windowed },
    integrations: { connected: integrations.length },
    lanes: {
      total: lanes.length,
      wired: lanes.filter((l) => l?.wired === true).length,
    },
    billing: {
      hasSubscription: subscription != null,
      planName: typeof subscription?.planName === "string" ? (subscription.planName as string) : null,
      interval: typeof subscription?.interval === "string" ? (subscription.interval as string) : null,
      invoices: invoices.length,
    },
    quotes: deriveQuotes(proposals, invoiceList, dealRooms),
    recent: buildRecent(records, windowMs, now),
    isEmpty,
  };
}

// ── Session classification ───────────────────────────────────────────────────

/** Every fetch 401'ing = no portal session → honest "Sign in" state. */
export function classifyStatuses(statuses: readonly number[]): "signedOut" | "ok" {
  if (statuses.length === 0) return "ok";
  return statuses.every((s) => s === 401) ? "signedOut" : "ok";
}

// ── Read outcomes (slice 183) ────────────────────────────────────────────────

/**
 * SLICE 183 — the honest outcome of one refresh.
 *
 * Both shared hooks (this one and portal-search.ts) used to hand-roll `fetch`
 * and coalesce with `|| []`, so a 401 and a 500 both became "zero rows": a
 * signed-out session and a broken store rendered as an empty workspace, which
 * is the same lie the C6 sweep found in individual pages. They now go through
 * `authedJson` (portal-primitives.ts) — the helper that refuses to invent data.
 */
export interface ReadFailure {
  /** Every read 401'd: there is no portal session to read with. */
  signedOut: boolean;
  /** The SERVER's own sentence for the first failed read (never invented). */
  error: string;
  /** The endpoints that failed in the latest refresh — real URLs. */
  sources: string[];
}

export interface PortalDashboardState {
  inputs: DashboardInputs;
  signedOut: boolean;
  loading: boolean;
  /**
   * True only when EVERY read in the latest refresh came back 2xx. An empty
   * state may render ONLY when this is true — otherwise "nothing here yet" is
   * being said about a store nobody managed to read.
   */
  loaded: boolean;
  /** Non-null when at least one read failed. */
  readError: ReadFailure | null;
  updatedAt: number | null;
  refreshDashboard: () => Promise<void>;
}

const EMPTY_APPROVALS = { pending: [], decided: [] };
const EMPTY_BILLING = { subscription: null, invoices: [] };

/** The eight read endpoints this hook owns, in call order. */
export const DASHBOARD_SOURCES = [
  "/api/portal/approvals",
  "/api/data/tasks",
  "/api/data/connected-accounts",
  "/api/native/import/lanes",
  "/api/native/billing",
  "/api/native/proposals",
  "/api/native/invoice",
  "/api/native/dealroom",
] as const;

/** A payload as a row list. `authedJson` already unwraps `data`, so both the
 *  served `{ data: [...] }` and a bare `[...]` answer land here. */
export function listOf<T = Record<string, unknown>>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const inner = (payload as { data?: unknown } | null | undefined)?.data;
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/** A payload as a plain object — projections read named fields off it. */
export function objectOf(payload: unknown): Record<string, any> {
  return payload && typeof payload === "object" ? (payload as Record<string, any>) : {};
}

// ── Live hook (single source for the Activity Hub + Analytics) ────────────────

/**
 * Fetch the eight real read endpoints through `authedJson`, derive nothing
 * client-side beyond the payload projections, and poll every 30s. SSR-safe:
 * the effect only runs in the browser; the initial state is an honest empty
 * dashboard. If EVERY endpoint 401s (no portal session) the state carries an
 * honest "Sign in" flag instead of numbers. If SOME endpoint fails, the failed
 * sources keep their previous rows, `loaded` stays false and `readError` names
 * them — a section is never emptied by a read that did not succeed.
 */
export function usePortalDashboard(intervalMs = 30000): PortalDashboardState {
  const [inputs, setInputs] = useState<DashboardInputs>({
    approvals: EMPTY_APPROVALS,
    taskRecords: [],
    integrations: [],
    lanes: [],
    billing: EMPTY_BILLING,
    proposals: [],
    invoices: [],
    dealRooms: [],
  });
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<ReadFailure | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const firstRun = useRef(true);

  const refreshDashboard = useCallback(async () => {
    try {
      const [a, t, i, l, b, p, inv, dr] = await Promise.all([
        authedJson<unknown>(DASHBOARD_SOURCES[0]),
        authedJson<unknown>(DASHBOARD_SOURCES[1]),
        authedJson<unknown>(DASHBOARD_SOURCES[2]),
        authedJson<unknown>(DASHBOARD_SOURCES[3]),
        authedJson<unknown>(DASHBOARD_SOURCES[4]),
        authedJson<unknown>(DASHBOARD_SOURCES[5]),
        authedJson<unknown>(DASHBOARD_SOURCES[6]),
        authedJson<unknown>(DASHBOARD_SOURCES[7]),
      ]);
      const results = [a, t, i, l, b, p, inv, dr];
      if (results.every((r) => !r.ok && r.signedOut)) {
        setSignedOut(true);
        setReadError(null);
        setLoaded(false);
        return;
      }
      setInputs((prev) => {
        const approvals = objectOf(a.ok ? a.data : null);
        const lanesPayload = objectOf(l.ok ? l.data : null);
        const billing = objectOf(b.ok ? b.data : null).billing;
        const integrations = objectOf(i.ok ? i.data : null);
        return {
          approvals: a.ok
            ? { pending: listOf(approvals.pending), decided: listOf(approvals.decided) }
            : prev.approvals,
          taskRecords: t.ok ? listOf(t.data) : prev.taskRecords,
          integrations: i.ok
            ? [...listOf(integrations.crm), ...listOf(integrations.erp), ...listOf(integrations.other)]
            : prev.integrations,
          lanes: l.ok ? (listOf(lanesPayload.lanes) as DashboardInputs["lanes"]) : prev.lanes,
          // SLICE 178 — the endpoint answers `{ ok: true, billing: {…} }`
          // (native/billing/router.ts:279,287); `authedJson` returns that body
          // whole because it carries no `data` key, so the envelope is read
          // here exactly once.
          billing: b.ok
            ? {
                subscription: (billing?.subscription ?? null) as Record<string, unknown> | null,
                invoices: listOf(billing?.invoices),
              }
            : prev.billing,
          proposals: p.ok ? listOf(p.data) : prev.proposals,
          invoices: inv.ok ? listOf(inv.data) : prev.invoices,
          dealRooms: dr.ok ? listOf(dr.data) : prev.dealRooms,
        };
      });
      const failed = results
        .map((r, idx) => ({ r, url: DASHBOARD_SOURCES[idx] as string }))
        .filter((x) => !x.r.ok);
      setSignedOut(false);
      setReadError(
        failed.length
          ? {
              signedOut: false,
              error: (failed[0].r as { error: string }).error,
              sources: failed.map((f) => f.url),
            }
          : null,
      );
      setLoaded(failed.length === 0);
      if (failed.length === 0) setUpdatedAt(Date.now());
    } catch (e) {
      setReadError({
        signedOut: false,
        error: e instanceof Error ? e.message : "Couldn't refresh dashboard data.",
        sources: [],
      });
      setLoaded(false);
    } finally {
      if (firstRun.current) {
        firstRun.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshDashboard();
    const t = setInterval(() => void refreshDashboard(), intervalMs);
    return () => clearInterval(t);
  }, [refreshDashboard, intervalMs]);

  return { inputs, signedOut, loading, loaded, readError, updatedAt, refreshDashboard };
}
