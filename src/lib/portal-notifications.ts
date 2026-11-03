/**
 * portal-notifications.ts — P2-3 honest, unified portal notifications (portal-only).
 *
 * This is the ONE notifications surface in the portal. It draws ONLY from
 * existing read-only endpoints (approval queue, import jobs + run ledger,
 * proposals, invoices, deal rooms) and derives everything — including
 * "unread" — from the real state of the underlying records. There is no
 * notification store to write to and nothing is persisted: an item is unread
 * while its record still needs attention, and it clears itself when that
 * record changes (approved, rejected, committed, sent, opened). Empty inputs
 * produce an empty feed — never placeholder rows, never invented activity.
 *
 * The legacy agent-era store (/api/data/system_notifications) is NOT served
 * anywhere in prod-server and every legacy write (markAsRead / markAllAsRead /
 * addNotification) targeted that dead endpoint — this module replaces that
 * theater with live, derived state. ZERO server/auth changes.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { invoiceStatusLabel, isInvoiceStatus } from "./invoice-status";
import { authedJson } from "./portal-primitives";
import type { InvoiceStatus } from "~/native/invoice/types";

/**
 * SLICE 182 — per-status notice copy for the invoice bell.
 *
 * `Record<InvoiceStatus, …>` (not a chain of `if`s): a status added to the
 * server's `INVOICE_STATUSES` is a COMPILE ERROR here, so the bell can never
 * again describe a state it has no copy for — which is how a `failed` invoice
 * came to read "Invoice sent". `draft` is null: nothing has been issued, so
 * there is nothing to report.
 */
const INVOICE_NOTICE_COPY: Record<InvoiceStatus, { title: string; tone: NoticeTone; trailer: string } | null> = {
  draft: null,
  // The label ("Sending", "Sent", "Not delivered") comes from invoice-status.ts;
  // this map adds only the bell's own title and the next step.
  queued: { title: "Sending…", tone: "info", trailer: "Open Invoices to track it." },
  sent: { title: "Invoice sent", tone: "info", trailer: "Open Invoices to track it." },
  failed: {
    title: "Invoice delivery failed",
    tone: "error",
    trailer: "Nothing reached the customer — open Invoices to retry.",
  },
};
/** A status this bundle does not know (server/bundle drift): shown verbatim. */
const UNKNOWN_INVOICE_NOTICE = { title: "Invoice status unknown", tone: "info" as NoticeTone, trailer: "Open Invoices to see the record." };

// ── Public types ────────────────────────────────────────────────────────────

export type NoticeKind = "approval" | "import" | "quote";
export type NoticeTone = "approval" | "complete" | "error" | "info";

export interface NoticeItem {
  /** Stable id, `${kind}:${entityId}` — used for de-duplication. */
  id: string;
  kind: NoticeKind;
  tone: NoticeTone;
  title: string;
  message: string;
  /** Real portal route the item links to. */
  link: string;
  /** Real timestamp from the source record (epoch ms). 0 = unknown. */
  at: number;
  /** Derived: the underlying record still needs attention. */
  unread: boolean;
}

export interface NoticeFeed {
  items: NoticeItem[];
  unreadCount: number;
}

// ── Source-record shapes (portal-safe views of existing API payloads) ───────

export interface ApprovalActionShape {
  actionId?: string;
  actionType?: string;
  provider?: string;
  summary?: { what?: string; where?: string; why?: string };
  status?: string;
  createdAt?: number;
  decidedAt?: number;
  decidedBy?: string;
  resultError?: string;
}

export interface RunLedgerShape {
  op?: string;
  at?: number | string;
  by?: string;
  note?: string | null;
  counts?: Record<string, number>;
  httpStatus?: number | null;
}

export interface ImportJobShape {
  id?: string;
  provider?: string;
  sourceLabel?: string;
  tableId?: string;
  status?: string;
}

export interface ProposalShape {
  id?: string;
  title?: string;
  clientName?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceShape {
  id?: string;
  invoiceNumber?: string;
  linkedDealRoomId?: string;
  amountDueCents?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DealRoomShape {
  id?: string;
  name?: string;
  customerName?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface NoticeFeedInputs {
  pending: ApprovalActionShape[];
  decided: ApprovalActionShape[];
  imports: ImportJobShape[];
  runsByJob: Record<string, RunLedgerShape[]>;
  proposals: ProposalShape[];
  invoices: InvoiceShape[];
  dealRooms: DealRoomShape[];
}

// ── Small honest helpers ─────────────────────────────────────────────────────

const PROVIDER_LABEL: Record<string, string> = {
  xero: "Xero",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  "google-workspace": "Google Workspace",
  microsoft: "Microsoft 365",
  slack: "Slack",
  docusign: "DocuSign",
  quickbooks: "QuickBooks",
};

function providerName(id: string | undefined): string {
  if (!id) return "";
  return PROVIDER_LABEL[id] ?? id;
}

/** Epoch-ms from a ledger/record timestamp that may be a number or ISO string. */
export function toEpochMs(ts: number | string | undefined): number {
  if (ts == null) return 0;
  const n = typeof ts === "number" ? ts : Date.parse(ts);
  return Number.isFinite(n) ? n : 0;
}

/** Combine a record's updated/created timestamps into one honest "at". */
function recordAt(updatedAt?: string, createdAt?: string): number {
  const u = toEpochMs(updatedAt);
  const c = toEpochMs(createdAt);
  return u || c;
}

/**
 * Human "time ago" label. Mirrors the approvals page convention; invalid or
 * unknown timestamps render "" (never a fabricated date).
 */
export function noticeTime(ts: number, now = Date.now()): string {
  if (!ts) return "";
  const s = Math.floor((now - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Ledger op → family (pull|map|commit|other) — same rule as the import page. */
function opFamily(op: string | undefined): "pull" | "map" | "commit" | "other" {
  const o = (op ?? "").toLowerCase();
  if (o.startsWith("pull")) return "pull";
  if (o.startsWith("map")) return "map";
  if (o.startsWith("commit")) return "commit";
  return "other";
}

/** Newest run in a family — only ever chosen from runs the ledger recorded. */
function latestRun(runs: RunLedgerShape[], family: "pull" | "map" | "commit") {
  let best: RunLedgerShape | undefined;
  let bestAt = -1;
  for (const r of runs) {
    if (opFamily(r.op) !== family) continue;
    const at = toEpochMs(r.at);
    if (at >= bestAt) {
      bestAt = at;
      best = r;
    }
  }
  return best;
}

function money(cents: number | undefined, currency: string | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "";
  const cur = currency ?? "";
  return `${cur} ${(cents / 100).toFixed(2)}`.trim();
}

// ── Feed builders ────────────────────────────────────────────────────────────

/** Approval Queue items — pending = needs your decision; decided = resolved. */
export function approvalNotices(pending: ApprovalActionShape[], decided: ApprovalActionShape[]): NoticeItem[] {
  const out: NoticeItem[] = [];
  for (const a of pending) {
    if (!a?.actionId) continue;
    out.push({
      id: `approval:${a.actionId}`,
      kind: "approval",
      tone: "approval",
      title: `Approval needed — ${a.actionType ?? "action"}`,
      message: `${a.summary?.what ?? a.summary?.where ?? "A gated action is waiting"}${
        providerName(a.provider) ? ` (${providerName(a.provider)})` : ""
      }. Decide it in Approvals.`,
      link: "/portal/approvals",
      at: toEpochMs(a.createdAt),
      unread: true,
    });
  }
  for (const a of decided) {
    if (!a?.actionId) continue;
    const status = a.status ?? "decided";
    out.push({
      id: `approval:${a.actionId}`,
      kind: "approval",
      tone: a.resultError ? "error" : "complete",
      title: `Action ${status} — ${a.actionType ?? "action"}`,
      message: `${a.actionType ?? "Action"} was ${status}${
        a.decidedBy ? ` by ${a.decidedBy}` : ""
      }${a.resultError ? ` — ${a.resultError}` : ""}.`,
      link: "/portal/approvals",
      at: toEpochMs(a.decidedAt) || toEpochMs(a.createdAt),
      unread: false,
    });
  }
  return out;
}

/**
 * Import jobs — drawn ONLY from the honest run ledger. A job with no recorded
 * run produces nothing (no fabricated activity). "staged" = rows staged,
 * nothing imported until you approve; "failed" = the last run did not
 * complete; "committed" = rows were imported.
 */
export function importNotices(imports: ImportJobShape[], runsByJob: Record<string, RunLedgerShape[]>): NoticeItem[] {
  const out: NoticeItem[] = [];
  for (const job of imports) {
    if (!job?.id) continue;
    const runs = runsByJob[job.id] ?? [];
    if (runs.length === 0) continue; // the ledger has no entry — nothing to report
    const label = job.sourceLabel || job.provider || job.id;
    const status = job.status ?? "draft";
    const commit = latestRun(runs, "commit");
    const pull = latestRun(runs, "pull");

    if (status === "committed" && commit) {
      const n = commit.counts?.rows ?? commit.counts?.imported;
      out.push({
        id: `import:${job.id}`,
        kind: "import",
        tone: "complete",
        title: "Import committed",
        message:
          n != null
            ? `${n} row(s) imported into your table from ${label}.`
            : `Rows from ${label} were committed to your table.`,
        link: "/portal/import",
        at: toEpochMs(commit.at),
        unread: false,
      });
    } else if (status === "failed") {
      const note = commit?.note ?? pull?.note;
      out.push({
        id: `import:${job.id}`,
        kind: "import",
        tone: "error",
        title: "Import failed",
        message: `${label}${note ? ` — ${note}` : ""}. Fix it in Imports and try again.`,
        link: "/portal/import",
        at: toEpochMs(commit?.at) || toEpochMs(pull?.at),
        unread: true,
      });
    } else if (status === "staged") {
      const n = pull?.counts?.rows;
      out.push({
        id: `import:${job.id}`,
        kind: "import",
        tone: "approval",
        title: "Import staged — nothing imported yet",
        message:
          `${label}${n != null ? ` — ${n} row(s) staged` : ""}. ` +
          "Commit is approval-gated; nothing is imported until you approve.",
        link: "/portal/import",
        at: toEpochMs(pull?.at),
        unread: true,
      });
    }
    // status "draft" or unknown with stray ledger rows → no honest signal; skip.
  }
  return out;
}

/** Quote-to-cash status changes — proposals, invoices, deal rooms. */
export function quoteNotices(
  proposals: ProposalShape[],
  invoices: InvoiceShape[],
  dealRooms: DealRoomShape[],
): NoticeItem[] {
  const out: NoticeItem[] = [];
  for (const p of proposals) {
    if (!p?.id || !p.status) continue;
    const client = p.clientName ? ` — ${p.clientName}` : "";
    if (p.status === "sent" || p.status === "pending") {
      out.push({
        id: `quote:proposal:${p.id}`,
        kind: "quote",
        tone: "approval",
        title: "Proposal awaiting review",
        message: `${p.title ?? "Untitled proposal"}${client}. Review it in Proposals.`,
        link: "/portal/proposals",
        at: recordAt(p.updatedAt, p.createdAt),
        unread: true,
      });
    } else if (p.status === "rejected") {
      out.push({
        id: `quote:proposal:${p.id}`,
        kind: "quote",
        tone: "error",
        title: "Proposal declined",
        message: `${p.title ?? "Untitled proposal"}${client}. See Proposals for details.`,
        link: "/portal/proposals",
        at: recordAt(p.updatedAt, p.createdAt),
        unread: true,
      });
    } else if (p.status === "approved") {
      out.push({
        id: `quote:proposal:${p.id}`,
        kind: "quote",
        tone: "complete",
        title: "Proposal approved",
        message: `${p.title ?? "Untitled proposal"}${client}. Send the next step from Proposals.`,
        link: "/portal/proposals",
        at: recordAt(p.updatedAt, p.createdAt),
        unread: false,
      });
    }
    // status "draft" → nothing to report yet.
  }
  for (const i of invoices) {
    if (!i?.id || !i.status) continue;
    // SLICE 182 — this loop skipped `draft` and then titled EVERY remaining
    // invoice "Invoice sent" in the neutral tone. Because the mail lane refuses
    // every message today, `failed` is the NORMAL state: the bell was telling
    // the tenant money was on its way for an invoice the server had recorded as
    // not delivered. The copy is now keyed by the server's own status enum
    // (`INVOICE_STATUSES`) through a `Record<InvoiceStatus, …>` map, so a new
    // state is a COMPILE ERROR here rather than a silent "Invoice sent".
    const copy = isInvoiceStatus(i.status) ? INVOICE_NOTICE_COPY[i.status] : UNKNOWN_INVOICE_NOTICE;
    if (copy === null) continue; // draft — nothing has been issued yet
    out.push({
      id: `quote:invoice:${i.id}`,
      kind: "quote",
      tone: copy.tone,
      title: copy.title,
      message: `${i.invoiceNumber ? `#${i.invoiceNumber} · ` : ""}${money(i.amountDueCents, i.currency)} — ${invoiceStatusLabel(
        i.status,
      )}. ${copy.trailer}`,
      link: "/portal/invoices",
      at: recordAt(i.updatedAt, i.createdAt),
      unread: true,
    });
  }
  for (const d of dealRooms) {
    if (!d?.id || d.status !== "draft") continue; // active/archived are not pending signals
    out.push({
      id: `quote:dealroom:${d.id}`,
      kind: "quote",
      tone: "approval",
      title: "Deal room ready to open",
      message: `${d.name ?? "Untitled deal room"}${d.customerName ? ` — ${d.customerName}` : ""}. Open it in Deal Rooms to start sharing.`,
      link: "/portal/deal-rooms",
      at: recordAt(d.updatedAt, d.createdAt),
      unread: true,
    });
  }
  return out;
}

/**
 * Merge everything into ONE honest feed: newest first, de-duplicated by
 * (kind, entity), capped at 50. "unreadCount" is derived from the same items
 * that render — never a separate number.
 */
export function buildNoticeFeed(inputs: NoticeFeedInputs): NoticeFeed {
  const all = [
    ...approvalNotices(inputs.pending, inputs.decided),
    ...importNotices(inputs.imports, inputs.runsByJob),
    ...quoteNotices(inputs.proposals, inputs.invoices, inputs.dealRooms),
  ].sort((a, b) => b.at - a.at);
  const seen = new Set<string>();
  const items: NoticeItem[] = [];
  for (const item of all) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= 50) break;
  }
  return { items, unreadCount: items.filter((i) => i.unread).length };
}

// ── Live hook (single source for shell badge + notifications page) ──────────
//
// SLICE 188 — this hook used to hand-roll five `fetch` calls, collect their
// statuses, and then parse EVERY body unconditionally. Only "all five 401" was
// treated as a failure; five 500s, five HTML fallbacks or five `{}` bodies all
// ended at `feed: []`, `unreadCount: 0`, error null — and the shell renders the
// bell only when `unreadCount > 0`, so the failure was invisible on every page
// except /portal/notifications, which then said "Nothing needs your attention
// right now". A tenant cannot be told their queue is clear by a read that
// failed. The reads now go through `authedJson` (the proven shape in
// portal-primitives), each source is judged on its own, and the outcome is
// carried as `loaded` + `readError` instead of an empty feed.

export interface PortalNotificationsState {
  feed: NoticeItem[];
  unreadCount: number;
  /**
   * True only when EVERY read in the latest refresh came back 2xx. The bell
   * badge and the notifications page may say "nothing needs your attention"
   * ONLY when this is true — otherwise they describe a queue nobody read.
   */
  loaded: boolean;
  /** Non-null when at least one read failed. Carries the SERVER's own words. */
  readError: string | null;
  updatedAt: number | null;
  refreshNotifications: () => void;
}

/** The five read endpoints the feed is derived from, in call order. */
export const NOTIFICATION_SOURCES = [
  "/api/portal/approvals",
  "/api/native/import",
  "/api/native/proposals",
  "/api/native/invoice",
  "/api/native/dealroom",
] as const;

const EMPTY_INPUTS: NoticeFeedInputs = {
  pending: [],
  decided: [],
  imports: [],
  runsByJob: {},
  proposals: [],
  invoices: [],
  dealRooms: [],
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asList<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Fetch the five real read endpoints through `authedJson`, derive the feed
 * client-side, and poll. A source that fails keeps its PREVIOUS rows (a read
 * that did not succeed never empties a section), `loaded` goes false and
 * `readError` names the first failure — so a bell that could not be refreshed
 * looks different from a workspace with nothing to do.
 */
export function usePortalNotifications(intervalMs = 30000): PortalNotificationsState {
  const [inputs, setInputs] = useState<NoticeFeedInputs>(EMPTY_INPUTS);
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refreshNotifications = useCallback(async () => {
    try {
      const results = await Promise.all(NOTIFICATION_SOURCES.map((url) => authedJson<unknown>(url)));
      const [a, i, p, inv, dr] = results;
      if (results.every((r) => !r.ok && r.signedOut)) {
        setInputs(EMPTY_INPUTS);
        setLoaded(false);
        setReadError("Sign in to see notifications.");
        return;
      }

      const imports = i.ok ? asList<ImportJobShape>(asRecord(i.data).imports) : [];
      // Bound the per-job run-ledger reads (honest + cheap: 8 jobs max). Each
      // one is judged like any other read: a failed ledger is a failed read.
      const ids = imports
        .map((im) => im.id)
        .filter((x): x is string => Boolean(x))
        .slice(0, 8);
      const runsByJob: Record<string, RunLedgerShape[]> = {};
      const runFailures: string[] = [];
      if (ids.length > 0) {
        const runResults = await Promise.all(
          ids.map((id) => authedJson<unknown>(`/api/native/import/${id}/runs`)),
        );
        ids.forEach((id, idx) => {
          const run = runResults[idx];
          if (run && run.ok) runsByJob[id] = asList<RunLedgerShape>(asRecord(run.data).runs);
          else runFailures.push(`/api/native/import/${id}/runs`);
        });
      }

      setInputs((prev) => ({
        pending: a.ok ? asList<ApprovalActionShape>(asRecord(a.data).pending) : prev.pending,
        decided: a.ok ? asList<ApprovalActionShape>(asRecord(a.data).decided) : prev.decided,
        imports: i.ok ? imports : prev.imports,
        runsByJob: i.ok ? runsByJob : prev.runsByJob,
        proposals: p.ok ? asList<ProposalShape>(p.data) : prev.proposals,
        invoices: inv.ok ? asList<InvoiceShape>(inv.data) : prev.invoices,
        dealRooms: dr.ok ? asList<DealRoomShape>(dr.data) : prev.dealRooms,
      }));

      const failed = results
        .map((r, idx) => ({ r, url: NOTIFICATION_SOURCES[idx] as string }))
        .filter((x) => !x.r.ok);
      const failedCount = failed.length + runFailures.length;
      if (failedCount === 0) {
        setReadError(null);
        setLoaded(true);
        setUpdatedAt(Date.now());
      } else {
        const first = failed[0]?.r as { error: string } | undefined;
        const message = first ? first.error : "A run ledger could not be read.";
        setReadError(failedCount === 1 ? message : `${message} (${failedCount} reads failed)`);
        setLoaded(false);
      }
    } catch (e) {
      // `authedJson` never throws; this only fires if something around it does.
      setReadError(e instanceof Error ? e.message : "Couldn't refresh notifications.");
      setLoaded(false);
    }
  }, []);

  useEffect(() => {
    void refreshNotifications();
    const t = setInterval(() => void refreshNotifications(), intervalMs);
    return () => clearInterval(t);
  }, [refreshNotifications, intervalMs]);

  // One derivation for the badge and the page: `unreadCount` can never disagree
  // with the items that render.
  const feed = useMemo(() => buildNoticeFeed(inputs).items, [inputs]);
  const unreadCount = useMemo(() => feed.filter((item) => item.unread).length, [feed]);

  return { feed, unreadCount, loaded, readError, updatedAt, refreshNotifications };
}
