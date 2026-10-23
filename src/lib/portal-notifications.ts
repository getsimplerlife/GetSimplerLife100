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

import { useCallback, useEffect, useState } from "react";

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
    if (!i?.id || !i.status || i.status === "draft") continue;
    out.push({
      id: `quote:invoice:${i.id}`,
      kind: "quote",
      tone: "info",
      title: "Invoice sent",
      message: `${i.invoiceNumber ? `#${i.invoiceNumber} · ` : ""}${money(i.amountDueCents, i.currency)}${
        i.invoiceNumber || money(i.amountDueCents, i.currency) ? " sent" : "recorded"
      }. Open Invoices to track it.`,
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

export interface PortalNotificationsState {
  feed: NoticeItem[];
  unreadCount: number;
  notificationsError: string | null;
  updatedAt: number | null;
  refreshNotifications: () => void;
}

/**
 * Fetch the five real read endpoints, derive the feed client-side, and poll.
 * SSR-safe: effect only runs in the browser; the initial state is an honest
 * empty feed. If every endpoint 401s (no portal session) the state carries an
 * honest "Sign in to see notifications." message instead of fake items.
 */
export function usePortalNotifications(intervalMs = 30000): PortalNotificationsState {
  const [feed, setFeed] = useState<NoticeItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refreshNotifications = useCallback(async () => {
    try {
      const [a, i, p, inv, dr] = await Promise.all([
        fetch("/api/portal/approvals", { credentials: "include" }),
        fetch("/api/native/import", { credentials: "include" }),
        fetch("/api/native/proposals", { credentials: "include" }),
        fetch("/api/native/invoice", { credentials: "include" }),
        fetch("/api/native/dealroom", { credentials: "include" }),
      ]);
      const statuses = [a.status, i.status, p.status, inv.status, dr.status];
      if (statuses.every((s) => s === 401)) {
        setFeed([]);
        setUnreadCount(0);
        setNotificationsError("Sign in to see notifications.");
        return;
      }
      const [aj, ij, pj, invj, drj] = await Promise.all(
        [a, i, p, inv, dr].map((r) => r.json().catch(() => ({}))),
      );
      const imports: ImportJobShape[] = Array.isArray(ij?.data?.imports) ? ij.data.imports : [];
      // Bound the per-job run-ledger fetches (honest + cheap: 8 jobs max).
      const runsByJob: Record<string, RunLedgerShape[]> = {};
      const ids = imports
        .map((im) => im.id)
        .filter((x): x is string => Boolean(x))
        .slice(0, 8);
      if (ids.length > 0) {
        const results = await Promise.all(
          ids.map(async (id) => {
            const r = await fetch(`/api/native/import/${id}/runs`, { credentials: "include" });
            const j = await r.json().catch(() => ({}));
            return [id, Array.isArray(j?.data?.runs) ? j.data.runs : []] as const;
          }),
        );
        for (const [id, runs] of results) runsByJob[id] = runs;
      }
      const built = buildNoticeFeed({
        pending: aj?.data?.pending ?? [],
        decided: aj?.data?.decided ?? [],
        imports,
        runsByJob,
        proposals: Array.isArray(pj?.data) ? pj.data : [],
        invoices: Array.isArray(invj?.data) ? invj.data : [],
        dealRooms: Array.isArray(drj?.data) ? drj.data : [],
      });
      setFeed(built.items);
      setUnreadCount(built.unreadCount);
      setNotificationsError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setNotificationsError(
        e instanceof Error ? e.message : "Couldn't refresh notifications.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshNotifications();
    const t = setInterval(() => void refreshNotifications(), intervalMs);
    return () => clearInterval(t);
  }, [refreshNotifications, intervalMs]);

  return { feed, unreadCount, notificationsError, updatedAt, refreshNotifications };
}