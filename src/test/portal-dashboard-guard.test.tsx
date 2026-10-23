/**
 * portal-dashboard-guard.test.tsx — P2-5 dashboard KPI integrity.
 *
 * Pins the Activity Hub (/portal) + Workspace Analytics (/portal/analytics)
 * + their shared lib (src/lib/portal-dashboard.ts) to the honesty bar:
 *
 *   1. BEHAVIOR — every KPI derives from real payload projections via the
 *      pure builders; empty stores → honest zeros + `isEmpty`, never
 *      placeholder rows; windows/statuses/quotes bucket exactly per the
 *      served contracts.
 *   2. CONTENT — the touched surfaces contain no hard-coded KPI literals
 *      (card values come from derived state identifiers), no dead or
 *      fabricated endpoint strings (/api/data/analytics, /api/v1, legacy
 *      billing), no agent-era vocabulary (coworker/bottleneck/labor-audit/
 *      ROI/telemetry/"trend type" artifact copy), and pages never fetch
 *      directly — all data flows through the lib's eight real endpoints.
 *   3. HONEST STATES — "Sign in" copy for a missing session, real empty
 *      states, honest refresh reporting.
 *
 * Portal-only surface guard (same pattern as portal-login-theme / P2-3). No
 * server or auth behavior is touched by P2-5; this file only asserts source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildRecent,
  classifyStatuses,
  deriveDashboard,
  deriveQuotes,
  recordAt,
  recordStatus,
  recordSummary,
  DASHBOARD_WINDOW_MS,
  WINDOW_ALL_MS,
  type DashboardInputs,
} from "../lib/portal-dashboard";

const NOW = 1_700_000_000_000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

const emptyInputs = (): DashboardInputs => ({
  approvals: { pending: [], decided: [] },
  taskRecords: [],
  integrations: [],
  lanes: [],
  billing: { subscription: null, invoices: [] },
  proposals: [],
  invoices: [],
  dealRooms: [],
});

// ── 1. Behavior: honest derivation from real payloads ─────────────────────────

describe("deriveDashboard — empty stores → honest zeros, never placeholders", () => {
  it("all-empty inputs produce zero counters, empty recent, isEmpty=true", () => {
    const d = deriveDashboard(emptyInputs(), NOW, DASHBOARD_WINDOW_MS["24h"]);
    expect(d.approvals).toEqual({ pending: 0, decided: 0 });
    expect(d.records).toEqual({ total: 0, inWindow: 0, completedInWindow: 0 });
    expect(d.integrations.connected).toBe(0);
    expect(d.lanes).toEqual({ total: 0, wired: 0 });
    expect(d.billing.hasSubscription).toBe(false);
    expect(d.billing.invoices).toBe(0);
    expect(d.quotes.proposals.total).toBe(0);
    expect(d.quotes.invoicesSent).toBe(0);
    expect(d.quotes.dealRooms).toEqual({ draft: 0, total: 0 });
    expect(d.recent).toEqual([]);
    expect(d.isEmpty).toBe(true);
  });
});

describe("classifyStatuses — honest sign-in detection", () => {
  it("all-401 → signedOut (missing session)", () => {
    expect(classifyStatuses([401, 401, 401])).toBe("signedOut");
  });
  it("mixed statuses → ok (per-source honesty, not a blanket sign-in)", () => {
    expect(classifyStatuses([200, 401, 200])).toBe("ok");
  });
  it("all-200 → ok", () => {
    expect(classifyStatuses([200, 200])).toBe("ok");
  });
  it("empty status list (no fetches) → ok (no false sign-in)", () => {
    expect(classifyStatuses([])).toBe("ok");
  });
});

describe("record parsing — the REAL /api/data/tasks contract", () => {
  it("startedAt is the primary time field (workflow_runs contract)", () => {
    expect(recordAt({ startedAt: "2023-11-14T22:13:20.000Z" })).toBe(NOW);
  });
  it("falls back to createdAt / timestamp / completedAt, 0 when unknown", () => {
    expect(recordAt({ createdAt: NOW })).toBe(NOW);
    expect(recordAt({ timestamp: NOW })).toBe(NOW);
    expect(recordAt({ completedAt: NOW + 1000 })).toBe(NOW + 1000);
    expect(recordAt({})).toBe(0);
  });
  it("statuses are lowercased regardless of source casing (server lowercases)", () => {
    expect(recordStatus({ status: "Completed" })).toBe("completed");
    expect(recordStatus({ status: "failed" })).toBe("failed");
    expect(recordStatus({})).toBe("");
  });
  it("summary prefers summary, then result/output (defensive)", () => {
    expect(recordSummary({ summary: "Reconciled" })).toBe("Reconciled");
    expect(recordSummary({ result: "ok" })).toBe("ok");
    expect(recordSummary({ output: "done" })).toBe("done");
    expect(recordSummary({})).toBe("");
  });
});

describe("deriveDashboard — realistic tenant payload → exact honest counts", () => {
  const inputs: DashboardInputs = {
    approvals: {
      pending: [{ actionId: "a1" }, { actionId: "a2" }],
      decided: [{ actionId: "a3", status: "approved" }],
    },
    taskRecords: [
      // 2 records inside 24h (one completed, one failed) …
      { id: "run-1", status: "completed", startedAt: new Date(NOW - HOUR).toISOString(), summary: "Reconciled" },
      { id: "run-2", status: "failed", startedAt: new Date(NOW - 2 * HOUR).toISOString(), summary: "oauth 401" },
      // … 1 completed outside 24h but inside 7d …
      { id: "run-3", status: "completed", startedAt: new Date(NOW - 40 * HOUR).toISOString() },
      // … 1 inside 30d only …
      { id: "run-4", status: "completed", startedAt: new Date(NOW - 10 * DAY).toISOString() },
      // … and 1 with NO timestamp (never bucketed into a dated window).
      { id: "task-1", status: "completed", summary: "untimed" },
    ],
    integrations: [{ providerId: "xero" }, { providerId: "hubspot" }, { providerId: "slack" }],
    lanes: [
      { provider: "xero", wired: true },
      { provider: "hubspot", wired: true },
      { provider: "slack", wired: true },
      { provider: "docusign", wired: true },
      { provider: "quickbooks", wired: false },
      { provider: "salesforce", wired: false },
      { provider: "gcal", wired: false },
      { provider: "microsoft", wired: false },
      { provider: "google-workspace", wired: false },
      { provider: "sendgrid", wired: false },
      { provider: "monday", wired: false },
      { provider: "asana", wired: false },
    ],
    billing: {
      subscription: { planName: "Growth", tier: "growth", amount: 599, interval: "month", status: "active" },
      invoices: [{ id: "in_1" }, { id: "in_2" }],
    },
    proposals: [
      { id: "p1", status: "sent" },
      { id: "p2", status: "pending" },
      { id: "p3", status: "approved" },
      { id: "p4", status: "rejected" },
    ],
    invoices: [
      { id: "i1", status: "sent" },
      { id: "i2", status: "draft" },
    ],
    dealRooms: [
      { id: "d1", status: "draft" },
      { id: "d2", status: "active" },
    ],
  };

  it("counts match the real payload exactly (24h window)", () => {
    const d = deriveDashboard(inputs, NOW, DASHBOARD_WINDOW_MS["24h"]);
    expect(d.approvals).toEqual({ pending: 2, decided: 1 });
    expect(d.records.total).toBe(5);
    expect(d.records.inWindow).toBe(2); // run-1 + run-2 (untimed + 40h + 10d excluded)
    expect(d.records.completedInWindow).toBe(1); // run-1
    expect(d.integrations.connected).toBe(3);
    expect(d.lanes).toEqual({ total: 12, wired: 4 });
    expect(d.billing.hasSubscription).toBe(true);
    expect(d.billing.planName).toBe("Growth");
    expect(d.billing.interval).toBe("month");
    expect(d.billing.invoices).toBe(2);
    expect(d.quotes.proposals).toEqual({ total: 4, awaitingReview: 2, approved: 1, declined: 1 });
    expect(d.quotes.invoicesSent).toBe(1); // draft excluded
    expect(d.quotes.dealRooms).toEqual({ draft: 1, total: 2 });
    expect(d.isEmpty).toBe(false);
  });

  it("the same payload widens correctly across windows (7d / 30d / all-time)", () => {
    const d7 = deriveDashboard(inputs, NOW, DASHBOARD_WINDOW_MS["7d"]);
    expect(d7.records.inWindow).toBe(3); // + run-3 (40h)
    expect(d7.records.completedInWindow).toBe(2);
    const d30 = deriveDashboard(inputs, NOW, DASHBOARD_WINDOW_MS["30d"]);
    expect(d30.records.inWindow).toBe(4); // + run-4 (10d)
    const all = deriveDashboard(inputs, NOW, WINDOW_ALL_MS);
    expect(all.records.inWindow).toBe(4); // untimed record stays out — never guessed
    expect(all.records.total).toBe(5);
  });

  it("recent activity is newest-first, window-filtered, capped at 8", () => {
    const many = [
      ...inputs.taskRecords,
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `bulk-${i}`,
        status: "completed",
        startedAt: new Date(NOW - (5 + i) * HOUR).toISOString(),
        summary: `bulk ${i}`,
      })),
    ];
    const d = deriveDashboard({ ...inputs, taskRecords: many }, NOW, DASHBOARD_WINDOW_MS["7d"]);
    expect(d.recent.length).toBe(8); // capped
    for (let i = 1; i < d.recent.length; i++) {
      expect(d.recent[i - 1].at).toBeGreaterThanOrEqual(d.recent[i].at);
    }
    expect(d.recent[0].id).toBe("run-1"); // newest (1h ago)
  });

  it("unknown/untimed records are never bucketed (no fabricated dates)", () => {
    const d = deriveDashboard(inputs, NOW, DASHBOARD_WINDOW_MS["24h"]);
    expect(d.recent.some((r) => r.id === "task-1")).toBe(false);
  });
});

describe("buildRecent — pure, bounded, honest ordering", () => {
  it("default limit 8; explicit limit respected", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`,
      status: "completed",
      startedAt: new Date(NOW - i * HOUR).toISOString(),
    }));
    expect(buildRecent(items, DASHBOARD_WINDOW_MS["7d"], NOW).length).toBe(8);
    expect(buildRecent(items, DASHBOARD_WINDOW_MS["7d"], NOW, 3).length).toBe(3);
  });
});

describe("deriveQuotes — status buckets match the P2-3 notifications semantics", () => {
  it("buckets only the statuses the product actually interprets", () => {
    const q = deriveQuotes(
      [
        { id: "a", status: "draft" }, // totals only, no bucket
        { id: "b", status: "unknown-state" }, // totals only
        { id: "c", status: "sent" },
        { id: "d", status: "approved" },
      ],
      [{ id: "i", status: "paid" }, { id: "j", status: "draft" }, { id: "k" }],
      [{ id: "r", status: "draft" }],
    );
    expect(q.proposals).toEqual({ total: 4, awaitingReview: 1, approved: 1, declined: 0 });
    expect(q.invoicesSent).toBe(1); // paid + (draft / unknown both excluded)
    expect(q.dealRooms).toEqual({ draft: 1, total: 1 });
  });
});

describe("deriveDashboard — billing null → no fabricated plan", () => {
  it("subscription null yields hasSubscription=false, no planName", () => {
    const d = deriveDashboard(
      { ...emptyInputs(), billing: { subscription: null, invoices: [] } },
      NOW,
      DASHBOARD_WINDOW_MS["24h"],
    );
    expect(d.billing.hasSubscription).toBe(false);
    expect(d.billing.planName).toBeNull();
  });
});

// ── 2 + 3. Content guards on the sliced surfaces ───────────────────────────────

const SRC = {
  lib: "src/lib/portal-dashboard.ts",
  dashboard: "src/lazy/portal.index.page.tsx",
  analytics: "src/lazy/portal.analytics.index.page.tsx",
} as const;

const readSrc = (f: (typeof SRC)[keyof typeof SRC]) => readFileSync(f, "utf8");

const LIB = readSrc(SRC.lib);
const DASH = readSrc(SRC.dashboard);
const ANALYTICS = readSrc(SRC.analytics);

// Fabricated-capability / agent-era vocabulary that must NEVER return to the
// dashboard surfaces (case-insensitive, word-bounded where useful).
const BANNED_KPI_VOCAB =
  /\b(coworker|bottleneck|sample|mock)\b|labor audit|labor allocation|predicted savings|\bROI\b|telemetry|Trend Matrix|trendType|trial mode|Executive Analytics|aiEmployee|AI Employee/i;

describe("content guard — no fabricated KPI story on the sliced surfaces", () => {
  for (const [name, src] of Object.entries({ lib: LIB, dashboard: DASH, analytics: ANALYTICS })) {
    it(`${name}: banned fabricated-capability vocabulary is absent`, () => {
      expect(src).not.toMatch(BANNED_KPI_VOCAB);
    });
  }

  it("no hard-coded KPI literals: card values come from derived state identifiers", () => {
    // Activity Hub cards: every value interpolates derived numbers.
    expect(DASH).toContain("value: String(pendingApprovals)");
    expect(DASH).toContain("derived.integrations.connected");
    expect(DASH).toContain("derived.records.inWindow");
    expect(DASH).toContain("derived.records.completedInWindow");
    // Analytics cards: same rule via its derived instance.
    expect(ANALYTICS).toContain("value: d.approvals.pending");
    expect(ANALYTICS).toContain("value: d.records.total");
    expect(ANALYTICS).toContain("value: d.quotes.proposals.awaitingReview");
    // No sample-data arrays of KPI numbers anywhere in the lib.
    expect(LIB).not.toMatch(/[{[]\s*[0-9]{2,3}\s*,\s*[0-9]{2,3}/);
  });
});

describe("content guard — pages never fetch; the lib owns ALL wiring", () => {
  it("the Analytics page has zero fetch() calls and zero API paths", () => {
    expect(ANALYTICS).not.toMatch(/fetch\s*\(/);
    expect(ANALYTICS).not.toMatch(/\bapi\//);
  });

  it("the Activity Hub makes exactly ONE fetch — the real approval-decision POST — and no other API calls", () => {
    expect(DASH.match(/fetch\s*\(/g)?.length ?? 0).toBe(1);
    expect(DASH).toContain('fetch("/api/portal/approvals"');
    // The ONLY api path on the page is the approvals decision lane.
    expect(DASH).not.toMatch(/\/api\/(?!portal\/approvals)/);
  });

  it("the lib wires EXACTLY the eight real read endpoints (no dead or fabricated paths)", () => {
    for (const path of [
      '"/api/portal/approvals"',
      '"/api/data/tasks"',
      '"/api/integrations"',
      '"/api/native/import/lanes"',
      '"/api/native/billing"',
      '"/api/native/proposals"',
      '"/api/native/invoice"',
      '"/api/native/dealroom"',
    ]) {
      expect(LIB).toContain(path);
    }
  });

  it("dead / fabricated endpoint families stay out: no /api/v1, no data/analytics, no legacy data/billing", () => {
    expect(LIB).not.toMatch(/api\/v1\//);
    expect(LIB).not.toMatch(/api\/data\/analytics/);
    expect(LIB).not.toMatch(/api\/data\/billing/);
    expect(DASH).not.toMatch(/api\/data\//);
    expect(ANALYTICS).not.toMatch(/api\/data\//);
  });
});

describe("content guard — honest states and honest copy", () => {
  it("missing-session pages say so plainly", () => {
    expect(DASH).toContain("Sign in to see your dashboard.");
    expect(ANALYTICS).toContain("Sign in to see your analytics.");
  });

  it("real empty states exist for both surfaces", () => {
    expect(DASH).toContain("No task or workflow run records");
    expect(ANALYTICS).toContain("No activity yet in this workspace");
    expect(ANALYTICS).toContain("PortalEmptyState");
  });

  it("no invented precision: analytics never computes un-backed ratios or hours", () => {
    expect(ANALYTICS).not.toMatch(/hours? saved/);
    expect(ANALYTICS).not.toMatch(/[0-9]+(?:\.[0-9])?%/); // no made-up percentage
  });
});

describe("content guard — real-count plumbing survives on both pages", () => {
  it("dashboard reads real lanes (import/lanes) and real quotes (proposals/invoices/deal rooms)", () => {
    expect(DASH).toContain("derived.lanes.wired");
    expect(DASH).toContain("derived.quotes.proposals.awaitingReview");
    expect(DASH).toContain("derived.quotes.invoicesSent");
    expect(DASH).toContain("derived.quotes.dealRooms.draft");
  });

  it("analytics reads the same derived truth, all-time", () => {
    expect(ANALYTICS).toContain("WINDOW_ALL_MS");
    expect(ANALYTICS).toContain("d.lanes.wired");
    expect(ANALYTICS).toContain("d.quotes.invoicesSent");
    expect(ANALYTICS).toContain("d.records.completedInWindow");
  });
});