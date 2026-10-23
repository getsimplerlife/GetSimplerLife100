/**
 * portal-global-search-guard.test.tsx — P2-7 global search (portal-only).
 *
 * Pins the search surface (/portal/search + src/lib/portal-search.ts) to the
 * P2 honesty bar:
 *
 *   1. BEHAVIOR — the index is built ONLY from real payload projections; the
 *      matcher is plain case-insensitive token inclusion (AND semantics) over
 *      real fields — no generated, suggested, or LLM content; every count on
 *      the page derives from the matched rows; caps keep the surface bounded.
 *   2. ENDPOINTS — the lib fetches EXACTLY the ten real read endpoints the
 *      dashboard/notifications/pages already use (all live-probed 401 after
 *      every publish) and never introduces a new search endpoint; the page
 *      itself performs no fetches and no writes.
 *   3. CONTENT — honest copy in every state (sign-in / empty / no-match /
 *      no-query), dark P2-1 palette, no agent-era or retired vocabulary, and
 *      the shell exposes search entry points (mobile icon + desktop header).
 *
 * Zero server/auth changes — this file only asserts source.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSearchIndex,
  searchWorkspace,
  entryText,
  providerLabel,
  SEARCH_CATEGORIES,
  type SearchInputs,
} from "../lib/portal-search";

const P = (rel: string) => join(process.cwd(), rel);
const read = (rel: string) => readFileSync(P(rel), "utf8");

const pageSrc = read("src/lazy/portal.search.index.page.tsx");
const libSrc = read("src/lib/portal-search.ts");
const shellSrc = read("src/lazy/portal.page.tsx");
const iconsSrc = read("src/components/PortalIcons.tsx");
const routeSrc = read("src/routes/portal.search.index.tsx");

const emptyInputs = (): SearchInputs => ({
  approvals: { pending: [], decided: [] },
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

// ── 1. Behavior: honest index + deterministic matcher ─────────────────────────

describe("buildSearchIndex — indexes only real payload projections", () => {
  it("empty inputs → empty index (no placeholder rows)", () => {
    expect(buildSearchIndex(emptyInputs())).toEqual([]);
  });

  it("populates all ten categories from their real sources", () => {
    const inputs: SearchInputs = {
      approvals: {
        pending: [{ actionId: "a1", actionType: "Send proposal", status: "pending", createdAt: 100 }],
        decided: [],
      },
      taskRecords: [{ id: "t1", status: "running", customer: "Acme", startedAt: 200, summary: "Onboard Acme" }],
      workflows: [{ id: "w1", name: "Monthly review", status: "active" }],
      reports: [{ name: "Pipeline", type: "summary", frequency: "weekly", format: "pdf", createdAt: "2026-01-02" }],
      proposals: [{ id: "p1", title: "Q3 engagement", clientName: "Beta Co", status: "sent" }],
      invoices: [{ id: "v1", invoiceNumber: "1042", amountDueCents: 5000, currency: "USD", status: "sent" }],
      dealRooms: [{ id: "d1", name: "Gamma project", customerName: "Gamma", status: "active" }],
      integrations: [{ id: "c1", providerId: "xero", _provider: { name: "Xero", category: "Accounting" }, connectedAt: 300 }],
      importJobs: [{ id: "j1", provider: "hubspot", sourceLabel: "Contacts master", status: "staged" }],
      lanes: [{ provider: "docusign", wired: false }],
    };
    const index = buildSearchIndex(inputs);
    expect(index.map((e) => e.category).sort()).toEqual(
      [...SEARCH_CATEGORIES].sort(),
    );
    // every entry links to a real portal route
    for (const e of index) expect(e.link).toMatch(/^\/portal\//);
    // invoice money renders from the real cents payload
    const invoice = index.find((e) => e.category === "invoices");
    expect(invoice?.title).toBe("Invoice #1042");
    expect(invoice?.subtitle).toContain("USD 50.00");
    // lane wiring is read from the record, never assumed
    const lane = index.find((e) => e.category === "lanes");
    expect(lane?.subtitle).toBe("Not wired yet");
    // provider names map through the canonical label table
    expect(providerLabel("xero")).toBe("Xero");
  });

  it("skips rows with no identifying fields — never invents labels", () => {
    const inputs = emptyInputs();
    inputs.taskRecords = [{ summary: "has a story" }, { status: "running" }, {}];
    const index = buildSearchIndex(inputs);
    expect(index.length).toBe(1);
    expect(index[0].id.startsWith("tasks:")).toBe(true);
  });
});

describe("searchWorkspace — deterministic token matching over real fields", () => {
  const inputs: SearchInputs = {
    approvals: { pending: [], decided: [] },
    taskRecords: [
      { id: "t1", summary: "Onboard Acme Corp", customer: "Acme", status: "running", startedAt: 1000 },
      { id: "t2", summary: "Send invoice to Beta", customer: "Beta Co", status: "completed", startedAt: 2000 },
    ],
    workflows: [{ id: "w1", name: "Monthly review", status: "active" }],
    reports: [],
    proposals: [{ id: "p1", title: "Q3 engagement", clientName: "Beta Co", status: "approved" }],
    invoices: [],
    dealRooms: [{ id: "d1", name: "Gamma project", status: "draft" }],
    integrations: [],
    importJobs: [],
    lanes: [],
  };
  const index = buildSearchIndex(inputs);

  it("matches case-insensitively on title/subtitle/keywords", () => {
    const r = searchWorkspace(index, "acme");
    expect(r.noMatches).toBe(false);
    expect(r.total).toBe(1);
    expect(r.groups[0].category).toBe("tasks");
    expect(r.groups[0].entries[0].title).toBe("Onboard Acme Corp");
  });

  it("AND semantics: every token must appear", () => {
    const one = searchWorkspace(index, "beta");
    expect(one.total).toBe(2); // task t2 + proposal p1 (client Beta Co)
    const two = searchWorkspace(index, "beta invoice");
    expect(two.total).toBe(1);
    expect(two.groups[0].category).toBe("tasks");
  });

  it("groups in the fixed category order, newest-first inside a group", () => {
    const r = searchWorkspace(index, "beta");
    expect(r.groups.map((g) => g.category)).toEqual(["tasks", "proposals"]);
    const taskGroup = r.groups[0];
    expect(taskGroup.entries.map((e) => e.id)).toEqual(["tasks:t2"]);
  });

  it("empty/whitespace query → noQuery, no groups", () => {
    for (const q of ["", "   "]) {
      const r = searchWorkspace(index, q);
      expect(r.noQuery).toBe(true);
      expect(r.groups).toEqual([]);
      expect(r.total).toBe(0);
    }
  });

  it("no matches → honest noMatches flag with zero fabricated counts", () => {
    const r = searchWorkspace(index, "zzz-nothing");
    expect(r.noMatches).toBe(true);
    expect(r.total).toBe(0);
    expect(r.groups).toEqual([]);
  });

  it("caps keep the surface bounded (per-category + total)", () => {
    const many = emptyInputs();
    many.taskRecords = Array.from({ length: 25 }, (_, i) => ({
      id: `t${i}`,
      summary: `Row number ${i}`,
      status: "completed",
      startedAt: i,
    }));
    const big = buildSearchIndex(many);
    const r = searchWorkspace(big, "row", { perCategory: 5, total: 7 });
    expect(r.groups[0].entries.length).toBeLessThanOrEqual(5);
    expect(r.total).toBeLessThanOrEqual(7);
  });

  it("entryText is built from real fields only", () => {
    const [task] = index.filter((e) => e.category === "tasks" && e.title === "Send invoice to Beta");
    expect(entryText(task)).toContain("invoice");
    expect(entryText(task)).toContain("completed");
  });
});

// ── 2. Endpoints: exactly the ten real reads, nothing new ─────────────────────

describe("endpoint discipline", () => {
  const ALLOWED = [
    "/api/portal/approvals",
    "/api/data/tasks",
    "/api/data/workflows",
    "/api/data/reports",
    "/api/native/proposals",
    "/api/native/invoice",
    "/api/native/dealroom",
    "/api/integrations",
    "/api/native/import",
    "/api/native/import/lanes",
  ];

  it("lib fetches EXACTLY the ten real read endpoints (no new search endpoint)", () => {
    const seen = new Set<string>();
    for (const m of libSrc.matchAll(/fetch\("(\/api\/[^"]+)"\s*,/g)) seen.add(m[1]);
    expect([...seen].sort()).toEqual([...ALLOWED].sort());
  });

  it("no dead/stale/fabricated endpoint strings anywhere in the slice", () => {
    const denylist = [
      "/api/v1",
      "/api/v2",
      "/api/data/analytics",
      "/api/data/employees",
      "/api/data/purchases",
      "/api/data/system_notifications",
      "/api/search",
      "/api/native/search",
      "/api/data/connected-accounts",
    ];
    for (const bad of denylist) {
      expect(libSrc).not.toContain(bad);
      expect(pageSrc).not.toContain(bad);
    }
  });

  it("page performs no direct fetches and no writes — all data flows through the lib", () => {
    expect(pageSrc).not.toMatch(/fetch\(/);
    expect(pageSrc).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/);
    expect(libSrc).not.toMatch(/method:\s*["'](POST|PUT|PATCH|DELETE)/);
  });
});

// ── 3. Content: honest copy, dark palette, entry points, vocabulary ───────────

describe("honest copy + states", () => {
  it("sign-in, empty-workspace, no-match, and no-query states are pinned", () => {
    expect(pageSrc).toContain("Sign in to see your search results.");
    expect(pageSrc).toContain("Nothing to search yet");
    expect(pageSrc).toContain("No matches for");
    expect(pageSrc).toContain("Type to search your workspace");
  });

  it("describes the honest data scope — real records only, nothing generated", () => {
    expect(pageSrc).toContain("Nothing is fetched beyond that and nothing is generated");
    expect(pageSrc).toContain("Searches this workspace's live data · refreshes every 30 seconds");
  });

  it("counts on the page derive from matched rows — no hard-coded totals", () => {
    // The only counts rendered are {group.entries.length}; no numeric literal
    // is used as a result total, and no fake-precision phrasing exists.
    expect(pageSrc).not.toMatch(/["'`][0-9]+\+ results?["'`]/i);
    expect(pageSrc).not.toContain("results found");
  });
});

describe("dark palette", () => {
  it("search page uses the P2-1 dark system — no light surfaces, no undefined steps", () => {
    expect(pageSrc).toMatch(/bg-stone-950/);
    expect(pageSrc).not.toMatch(/bg-white rounded-3xl/);
    expect(pageSrc).not.toMatch(/stone-850|stone-150/);
  });
  it("shell header additions stay on the dark palette", () => {
    expect(shellSrc).not.toMatch(/bg-white rounded-3xl/);
    expect(shellSrc).not.toMatch(/stone-850|stone-150/);
  });
});

describe("route + entry points", () => {
  it("search route exists and lazy-loads the search page", () => {
    expect(routeSrc).toContain('createFileRoute("/portal/search/")');
    expect(routeSrc).toContain("portal.search.index.page");
  });

  it("the portal shell exposes search entry points (mobile icon + desktop header)", () => {
    expect(shellSrc).toContain('to="/portal/search"');
    expect(shellSrc).toContain("Search your workspace");
    expect(shellSrc).toContain('name="search"');
  });

  it("PortalIcons registry carries the search glyph", () => {
    expect(iconsSrc).toMatch(/\| "search";/);
    expect(iconsSrc).toMatch(/search: "M11 19a8 8 0 100-16 8 8 0 000 16zm10 2l-4\.35-4\.35"/);
  });
});

describe("vocabulary hygiene", () => {
  it("no agent-era or retired vocabulary in the slice sources", () => {
    for (const src of [pageSrc, libSrc, routeSrc]) {
      expect(src).not.toMatch(/AI Operations Team|AI coworkers|AI Employee|AI agent|AI workforce/i);
      expect(src).not.toMatch(/\$2,500 Automation Sprint|Industry Blueprint|Deep-Dive AI|Connection Pack/);
      expect(src).not.toMatch(/telemetry|labor audit|bottleneck/);
    }
  });

  it("no LLM/generated-content claims in copy", () => {
    expect(pageSrc).not.toMatch(/LLM|semantic search|AI-powered search|suggested results/i);
    expect(libSrc).not.toMatch(/LLM|semantic search|suggested results/i);
  });
});