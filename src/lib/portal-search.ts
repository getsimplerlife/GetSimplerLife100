/**
 * portal-search.ts — P2-7 portal-wide global search (portal-only).
 *
 * ONE search surface for the whole portal. It indexes ONLY what the existing
 * read-only endpoints already serve to the dashboard/notifications/pages —
 * the ten endpoints that are live-probed after every publish:
 *
 *   approvals   /api/portal/approvals        approval-queue records
 *   tasks       /api/data/tasks              tenant task/workflow-run records
 *   integrations /api/integrations           the live OAuth credential store
 *   lanes       /api/native/import/lanes     per-tenant import lane wiring
 *   imports     /api/native/import           per-tenant import jobs
 *   proposals   /api/native/proposals        quote-to-cash proposals
 *   invoices    /api/native/invoice          quote-to-cash invoices
 *   deal rooms  /api/native/dealroom         shared client deal spaces
 *   workflows   /api/data/workflows          tenant workflows store
 *   reports     /api/data/reports            tenant reports store
 *
 * Nothing is generated or guessed: every result row is a real record this
 * workspace stores, matched by plain token inclusion on its real
 * fields (title/subtitle/keywords all come from the payload). Counts render
 * ONLY from the matched arrays — there are no fabricated totals, no empty
 * "sponsored" rows, no hidden data sources. Hooks are SSR-safe (fetch effects
 * run only in the browser; the initial state is an honest empty index) and
 * poll on the same 30s cadence as the dashboard. ZERO server/auth changes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordAt, recordStatus, recordSummary, classifyStatuses } from "./portal-dashboard";
import { toEpochMs } from "./portal-notifications";

// ── Categories (fixed order, real portal routes) ─────────────────────────────

export type SearchCategory =
  | "tasks"
  | "workflows"
  | "proposals"
  | "invoices"
  | "dealrooms"
  | "reports"
  | "approvals"
  | "integrations"
  | "imports"
  | "lanes";

export interface SearchCategoryMeta {
  label: string;
  link: string;
}

/** Fixed category order — Tasks first, quote-to-cash next, data surfaces last. */
export const SEARCH_CATEGORIES: SearchCategory[] = [
  "tasks",
  "workflows",
  "reports",
  "proposals",
  "invoices",
  "dealrooms",
  "approvals",
  "integrations",
  "imports",
  "lanes",
];

export const SEARCH_CATEGORY_META: Record<SearchCategory, SearchCategoryMeta> = {
  tasks: { label: "Tasks & workflow runs", link: "/portal/tasks" },
  workflows: { label: "Workflows", link: "/portal/workflows" },
  reports: { label: "Reports", link: "/portal/reports" },
  proposals: { label: "Proposals", link: "/portal/proposals" },
  invoices: { label: "Invoices", link: "/portal/invoices" },
  dealrooms: { label: "Deal rooms", link: "/portal/deal-rooms" },
  approvals: { label: "Approvals", link: "/portal/approvals" },
  integrations: { label: "Integrations", link: "/portal/integrations" },
  imports: { label: "Imports", link: "/portal/import" },
  lanes: { label: "Import lanes", link: "/portal/import" },
};

// ── Index entry ──────────────────────────────────────────────────────────────

export interface SearchEntry {
  /** Stable key: `${category}:${record id}` — used for React keys + de-dup. */
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  /** Extra real fields searched but not shown (statuses, ids, technical bits). */
  keywords: string[];
  /** Real portal route the result links to. */
  link: string;
  /** Real record timestamp (epoch ms); 0 = unknown/untimed. */
  at: number;
}

export interface SearchInputs {
  approvals: { pending: Record<string, unknown>[]; decided: Record<string, unknown>[] };
  taskRecords: Record<string, unknown>[];
  workflows: Record<string, unknown>[];
  reports: Record<string, unknown>[];
  proposals: Record<string, unknown>[];
  invoices: Record<string, unknown>[];
  dealRooms: Record<string, unknown>[];
  integrations: Record<string, unknown>[];
  importJobs: Record<string, unknown>[];
  lanes: Record<string, unknown>[];
}

// ── Small honest helpers ─────────────────────────────────────────────────────

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

/** Quote-to-cash record time — updatedAt wins, else createdAt (like P2-3). */
function quoteAt(r: Record<string, unknown>): number {
  const u = toEpochMs(r.updatedAt as number | string | undefined);
  const c = toEpochMs(r.createdAt as number | string | undefined);
  return u || c;
}

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

export function providerLabel(id: string | undefined): string {
  if (!id) return "";
  return PROVIDER_LABEL[id] ?? id;
}

/** A record earned its row if any identifying field is non-empty — never invent labels. */
function hasAny(...values: unknown[]): boolean {
  return values.some((v) => str(v).trim() !== "");
}

// ── Per-category index builders (each one reads only its real payload) ───────

function taskEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const t of rows) {
    const id = str(t.id);
    const summary = recordSummary(t);
    const customer = str(t.customer);
    const automation = str(t.aiEmployee);
    if (!hasAny(id, summary, customer, automation)) continue;
    out.push({
      id: `tasks:${id || out.length}`,
      category: "tasks",
      title: summary || (automation ? `${automation} record` : "Task record"),
      subtitle: [customer, id].filter(Boolean).join(" · "),
      keywords: [automation, recordStatus(t), id, str(t.status)],
      link: "/portal/tasks",
      at: recordAt(t),
    });
  }
  return out;
}

function workflowEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const w of rows) {
    const name = str(w.name);
    const id = str(w.id);
    if (!hasAny(name, id)) continue;
    out.push({
      id: `workflows:${id || out.length}`,
      category: "workflows",
      title: name || "Workflow",
      subtitle: id ? `ID: ${id.slice(0, 8)}` : "",
      keywords: [id, recordStatus(w), str(w.status)],
      link: "/portal/workflows",
      at: 0,
    });
  }
  return out;
}

function reportEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const r of rows) {
    const name = str(r.name);
    if (!hasAny(name)) continue;
    const createdAt = str(r.createdAt);
    out.push({
      id: `reports:${name || out.length}`,
      category: "reports",
      title: name || "Report",
      subtitle: [str(r.type), str(r.frequency), str(r.format)].filter(Boolean).join(" · "),
      keywords: [str(r.type), str(r.frequency), str(r.format), createdAt],
      link: "/portal/reports",
      at: toEpochMs(createdAt as string | number | undefined),
    });
  }
  return out;
}

function proposalEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const p of rows) {
    const title = str(p.title);
    if (!hasAny(title)) continue;
    const status = recordStatus(p);
    out.push({
      id: `proposals:${str(p.id) || out.length}`,
      category: "proposals",
      title,
      subtitle: str(p.clientName),
      keywords: [str(p.clientName), str(p.id), status],
      link: "/portal/proposals",
      at: quoteAt(p),
    });
  }
  return out;
}

function invoiceEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const i of rows) {
    const number = str(i.invoiceNumber);
    const id = str(i.id);
    if (!hasAny(number, id)) continue;
    const status = recordStatus(i);
    const amount =
      typeof i.amountDueCents === "number" && Number.isFinite(i.amountDueCents)
        ? `${str(i.currency || "")} ${(i.amountDueCents / 100).toFixed(2)}`.trim()
        : "";
    out.push({
      id: `invoices:${id || out.length}`,
      category: "invoices",
      title: number ? `Invoice #${number}` : "Invoice",
      subtitle: [amount, status].filter(Boolean).join(" · "),
      keywords: [id, status, amount, str(i.currency), str(i.linkedDealRoomId)],
      link: "/portal/invoices",
      at: quoteAt(i),
    });
  }
  return out;
}

function dealRoomEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const d of rows) {
    const name = str(d.name);
    if (!hasAny(name)) continue;
    out.push({
      id: `dealrooms:${str(d.id) || out.length}`,
      category: "dealrooms",
      title: name || "Deal room",
      subtitle: str(d.customerName),
      keywords: [str(d.customerName), str(d.id), recordStatus(d), str(d.status)],
      link: "/portal/deal-rooms",
      at: quoteAt(d),
    });
  }
  return out;
}

function approvalEntries(pending: Record<string, unknown>[], decided: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  const push = (a: Record<string, unknown>) => {
    const actionId = str(a.actionId);
    if (!hasAny(actionId)) return;
    const what = str((a.summary as Record<string, unknown> | undefined)?.what);
    const where = str((a.summary as Record<string, unknown> | undefined)?.where);
    const why = str((a.summary as Record<string, unknown> | undefined)?.why);
    const provider = providerLabel(str(a.provider));
    out.push({
      id: `approvals:${actionId || out.length}`,
      category: "approvals",
      title: str(a.actionType) || "Approval",
      subtitle: [provider, recordStatus(a), str(a.decidedBy)].filter(Boolean).join(" · "),
      keywords: [actionId, provider, str(a.actionType), what, where, why, recordStatus(a)],
      link: "/portal/approvals",
      at: toEpochMs(a.decidedAt as number | string | undefined) || toEpochMs(a.createdAt as number | string | undefined),
    });
  };
  for (const a of pending) push(a);
  for (const a of decided) push(a);
  return out;
}

function integrationEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const c of rows) {
    const provider = providerLabel(str(c.providerId) || str(c.provider));
    const name = str((c._provider as Record<string, unknown> | undefined)?.name) || str(c.name);
    if (!hasAny(provider, name)) continue;
    const category = str((c._provider as Record<string, unknown> | undefined)?.category) || str(c.category);
    out.push({
      id: `integrations:${str(c.id) || out.length}`,
      category: "integrations",
      title: name || provider || "Integration",
      subtitle: category,
      keywords: [provider, str(c.providerId), str(c.provider), category, str(c.connectedAt)],
      link: "/portal/integrations",
      at: toEpochMs(c.connectedAt as number | string | undefined),
    });
  }
  return out;
}

function importJobEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const j of rows) {
    const label = str(j.sourceLabel);
    const provider = providerLabel(str(j.provider));
    const id = str(j.id);
    if (!hasAny(label, provider, id)) continue;
    out.push({
      id: `imports:${id || out.length}`,
      category: "imports",
      title: label || "Import",
      subtitle: [provider, recordStatus(j), str(j.tableId)].filter(Boolean).join(" · "),
      keywords: [provider, id, str(j.tableId), recordStatus(j), str(j.status)],
      link: "/portal/import",
      at: 0,
    });
  }
  return out;
}

function laneEntries(rows: Record<string, unknown>[]): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const l of rows) {
    const provider = providerLabel(str(l.provider));
    if (!hasAny(provider)) continue;
    out.push({
      id: `lanes:${provider || out.length}`,
      category: "lanes",
      title: provider || "Lane",
      subtitle: l?.wired === true ? "Wired" : "Not wired yet",
      keywords: [provider, "not wired", "wired"],
      link: "/portal/import",
      at: 0,
    });
  }
  return out;
}

// ── Index + pure query ───────────────────────────────────────────────────────

/** Build the full honest search index from every real payload projection. */
export function buildSearchIndex(inputs: SearchInputs): SearchEntry[] {
  return [
    ...taskEntries(Array.isArray(inputs.taskRecords) ? inputs.taskRecords : []),
    ...workflowEntries(Array.isArray(inputs.workflows) ? inputs.workflows : []),
    ...reportEntries(Array.isArray(inputs.reports) ? inputs.reports : []),
    ...proposalEntries(Array.isArray(inputs.proposals) ? inputs.proposals : []),
    ...invoiceEntries(Array.isArray(inputs.invoices) ? inputs.invoices : []),
    ...dealRoomEntries(Array.isArray(inputs.dealRooms) ? inputs.dealRooms : []),
    ...approvalEntries(
      Array.isArray(inputs.approvals?.pending) ? inputs.approvals.pending : [],
      Array.isArray(inputs.approvals?.decided) ? inputs.approvals.decided : [],
    ),
    ...integrationEntries(Array.isArray(inputs.integrations) ? inputs.integrations : []),
    ...importJobEntries(Array.isArray(inputs.importJobs) ? inputs.importJobs : []),
    ...laneEntries(Array.isArray(inputs.lanes) ? inputs.lanes : []),
  ];
}

/** Normalized searchable text of one entry — real fields only. */
export function entryText(entry: SearchEntry): string {
  return [entry.title, entry.subtitle, ...entry.keywords].join(" ").toLowerCase();
}

export interface SearchResult {
  category: SearchCategory;
  label: string;
  link: string;
  entries: SearchEntry[];
}

export interface SearchResults {
  groups: SearchResult[];
  /** Total matched entries across all groups (the only count we ever show). */
  total: number;
  /** Query had no tokens → nothing searched yet. */
  noQuery: boolean;
  /** Query had tokens but nothing matched. */
  noMatches: boolean;
}

const DEFAULT_PER_CATEGORY = 10;
const DEFAULT_TOTAL = 60;

/**
 * Deterministic token search: every non-empty query token must appear in the
 * entry's real text (AND semantics, case-insensitive). Results are grouped in
 * the fixed category order, newest-first inside each group (untimed rows keep
 * their index order), and capped per category + overall so the surface stays
 * bounded. No synonyms, no stemming, no fabrication, no guesses.
 */
export function searchWorkspace(
  index: SearchEntry[],
  query: string,
  opts?: { perCategory?: number; total?: number },
): SearchResults {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const unique = [...new Set(tokens)];
  if (unique.length === 0) {
    return { groups: [], total: 0, noQuery: true, noMatches: false };
  }
  const perCategory = opts?.perCategory ?? DEFAULT_PER_CATEGORY;
  const totalCap = opts?.total ?? DEFAULT_TOTAL;

  const buckets = new Map<SearchCategory, SearchEntry[]>();
  for (const entry of index) {
    const hay = entryText(entry);
    if (!unique.every((t) => hay.includes(t))) continue;
    const bucket = buckets.get(entry.category);
    if (!bucket) buckets.set(entry.category, [entry]);
    else bucket.push(entry);
  }

  const groups: SearchResult[] = [];
  let total = 0;
  for (const category of SEARCH_CATEGORIES) {
    const bucket = buckets.get(category) ?? [];
    if (bucket.length === 0) continue;
    const sorted = [...bucket].sort((a, b) => b.at - a.at || 0);
    const entries = sorted.slice(0, perCategory);
    if (total + entries.length > totalCap) entries.length = Math.max(0, totalCap - total);
    if (entries.length === 0) break;
    total += entries.length;
    groups.push({ category, label: SEARCH_CATEGORY_META[category].label, link: SEARCH_CATEGORY_META[category].link, entries });
  }
  return { groups, total, noQuery: false, noMatches: total === 0 };
}

// ── Live hook (single source for /portal/search) ─────────────────────────────

export interface PortalGlobalSearchState {
  inputs: SearchInputs;
  index: SearchEntry[];
  signedOut: boolean;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
  refreshSearch: () => Promise<void>;
}

const EMPTY_APPROVALS = { pending: [], decided: [] };

/**
 * Fetch the ten real read endpoints, build the index client-side, and poll
 * every 30s. SSR-safe: the effect only runs in the browser; the initial state
 * is an honest empty index. If EVERY endpoint 401s (no portal session) the
 * state carries an honest "Sign in" flag instead of results; a single failed
 * source simply contributes no rows to its category.
 */
export function usePortalGlobalSearch(intervalMs = 30000): PortalGlobalSearchState {
  const [inputs, setInputs] = useState<SearchInputs>({
    approvals: EMPTY_APPROVALS,
    taskRecords: [],
    workflows: [],
    reports: [],
    proposals: [],
    invoices: [],
    dealRooms: [],
    integrations: [],
    importJobs: [],
    lanes: [],
  });
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const firstRun = useRef(true);

  const refreshSearch = useCallback(async () => {
    try {
      const [a, t, w, r, p, inv, dr, i, imp, l] = await Promise.all([
        fetch("/api/portal/approvals", { credentials: "include" }),
        fetch("/api/data/tasks", { credentials: "include" }),
        fetch("/api/data/workflows", { credentials: "include" }),
        fetch("/api/data/reports", { credentials: "include" }),
        fetch("/api/native/proposals", { credentials: "include" }),
        fetch("/api/native/invoice", { credentials: "include" }),
        fetch("/api/native/dealroom", { credentials: "include" }),
        fetch("/api/integrations", { credentials: "include" }),
        fetch("/api/native/import", { credentials: "include" }),
        fetch("/api/native/import/lanes", { credentials: "include" }),
      ]);
      const statuses = [a.status, t.status, w.status, r.status, p.status, inv.status, dr.status, i.status, imp.status, l.status];
      if (classifyStatuses(statuses) === "signedOut") {
        setSignedOut(true);
        setError(null);
        return;
      }
      const [aj, tj, wj, rj, pj, invj, drj, ij, impj, lj] = await Promise.all(
        [a, t, w, r, p, inv, dr, i, imp, l].map((res) => res.json().catch(() => ({}))),
      );
      setInputs({
        approvals: {
          pending: Array.isArray(aj?.data?.pending) ? aj.data.pending : [],
          decided: Array.isArray(aj?.data?.decided) ? aj.data.decided : [],
        },
        taskRecords: Array.isArray(tj?.data) ? tj.data : [],
        workflows: Array.isArray(wj?.data) ? wj.data : [],
        reports: Array.isArray(rj?.data) ? rj.data : [],
        proposals: Array.isArray(pj?.data) ? pj.data : [],
        invoices: Array.isArray(invj?.data) ? invj.data : [],
        dealRooms: Array.isArray(drj?.data) ? drj.data : [],
        integrations: Array.isArray(ij?.data) ? ij.data : [],
        importJobs: Array.isArray(impj?.data?.imports) ? impj.data.imports : [],
        lanes: Array.isArray(lj?.data?.lanes) ? lj.data.lanes : [],
      });
      setSignedOut(false);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't refresh search data.");
    } finally {
      if (firstRun.current) {
        firstRun.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshSearch();
    const t = setInterval(() => void refreshSearch(), intervalMs);
    return () => clearInterval(t);
  }, [refreshSearch, intervalMs]);

  const index = useMemo(() => buildSearchIndex(inputs), [inputs]);

  return { inputs, index, signedOut, loading, error, updatedAt, refreshSearch };
}