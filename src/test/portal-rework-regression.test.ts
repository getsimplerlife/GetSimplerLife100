/**
 * portal-rework-regression.test.ts — P0 portal rework (owner 10-22) guardrail.
 * Pins the approved audit outcomes P0-1..P0-4 so they cannot silently regress:
 *   - duplicate routes/pages deleted (knowledge-base, chat) stay ABSENT — same
 *     pattern as the retired /audit guardrails; the dashboards path was
 *     re-instated by slice 135 on the real 3.6 router, so it is pinned
 *     POSITIVELY instead (see SLICE135_DASHBOARDS below);
 *   - the sidebar nav carries the money-workflow (Workspace) section and the
 *     one-shot import entry, with no duplicate AI Chat nav item;
 *   - undefined Tailwind steps (stone-850 / stone-150) are gone from the
 *     portal shell/pages;
 *   - the five light-theme surfaces stay on the dark shell palette
 *     (no bg-white rounded-3xl / stone-900-on-dark headings).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const P = (rel: string) => join(process.cwd(), rel);

const DELETED_ROUTES = [
  "src/routes/portal.knowledge-base.index.tsx",
  "src/lazy/portal.knowledge-base.index.page.tsx",
  "src/routes/portal.chat.index.tsx",
  "src/lazy/portal.chat.index.page.tsx",
];

/**
 * The dashboards entry is deliberately NOT in the list above any more.
 *
 * The P0 rework (owner 10-22) deleted the old /portal/dashboards page because
 * it was a DUPLICATE — it fetched a data-layer route with no server handler and
 * duplicated the Activity Hub. Slice 135 (owner directive 2026-10-29: "build
 * everything we can right now") re-created that path on purpose, now wired to
 * the real Phase 3.6 dashboard router (/api/native/dashboard*) which had no
 * portal UI at all. It is therefore not the duplicate the P0 sweep removed, and
 * the pin below proves it: the route must mount the 3.6 page and that page must
 * call the 3.6 routes. The knowledge-base and chat deletions stay pinned.
 */
const SLICE135_DASHBOARDS = [
  "src/routes/portal.dashboards.index.tsx",
  "src/lazy/portal.dashboards.index.page.tsx",
];

describe("P0 portal rework guardrails (owner 10-22)", () => {
  it("duplicate KB / chat routes stay deleted and /portal/dashboards mounts the real 3.6 page", () => {
    for (const rel of DELETED_ROUTES) {
      expect(existsSync(P(rel)), `${rel} should be deleted`).toBe(false);
    }
    // Keeper routes survive.
    expect(existsSync(P("src/routes/portal.knowledgebase.index.tsx"))).toBe(true);
    expect(existsSync(P("src/routes/portal.import.index.tsx"))).toBe(true);
    // Slice 135 re-instates /portal/dashboards on the REAL 3.6 router — the
    // page must exist AND must mount the 3.6 page (never a duplicate stub).
    for (const rel of SLICE135_DASHBOARDS) {
      expect(existsSync(P(rel)), `${rel} should exist (slice 135)`).toBe(true);
    }
    const dashRoute = readFileSync(P("src/routes/portal.dashboards.index.tsx"), "utf8");
    expect(dashRoute).toContain('createFileRoute("/portal/dashboards/")');
    expect(dashRoute).toContain("~/lazy/portal.dashboards.index.page");
    const dashPage = readFileSync(P("src/lazy/portal.dashboards.index.page.tsx"), "utf8");
    expect(dashPage).toContain("/api/native/dashboard");
  });

  it("sidebar nav promotes the money workflow (Workspace) + one-shot import, without AI Chat or CRM/ERP dupes", () => {
    const shell = readFileSync(P("src/lazy/portal.page.tsx"), "utf8");
    // Workspace section = quote-to-cash anchor.
    for (const p of [
      "name: \"Proposals\"",
      "name: \"Invoices\"",
      "name: \"Checklists\"",
      "name: \"Deal Rooms\"",
      "name: \"Boards\"",
      "name: \"Tasks\"",
      "name: \"Surveys\"",
    ]) {
      expect(shell).toContain(p);
    }
    // Consolidated storage entry: Documents & Vault carries the storage
    // triad (former Inbox / Documents / File Library entries are retired).
    expect(shell).toContain('name: "Documents & Vault"');
    expect(shell).toContain('path: "/portal/vault"');
    for (const retired of ['name: "Inbox",', 'name: "Documents",', 'name: "File Library",']) {
      expect(shell, `retired nav literal ${retired} must be absent`).not.toContain(retired);
    }
    // One-shot import entry (P0-2) with import-framing label.
    expect(shell).toContain('name: "Bring your data in"');
    expect(shell).toContain('path: "/portal/import"');
    // One chat = Assistant; no duplicate AI Chat nav item; CRM/ERP/Connected
    // Accounts collapsed into the single Integrations item.
    expect(shell).not.toMatch(/name: "AI Chat"/);
    expect(shell).toContain('name: "Assistant"');
    expect(shell).toContain('name: "Integrations"');
    expect(shell).not.toContain('name: "CRM"');
    expect(shell).not.toContain('name: "ERP"');
    expect(shell).not.toContain('name: "Connected Accounts"');
  });

  it("undefined Tailwind steps (stone-850 / stone-150) are gone from the portal", () => {
    const files = [
      "src/lazy/portal.page.tsx",
      "src/lazy/portal.users.index.page.tsx",
      "src/lazy/portal.reports.index.page.tsx",
      "src/lazy/portal.tasks.index.page.tsx",
      "src/lazy/portal.communications.index.page.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(P(rel), "utf8");
      expect(src).not.toMatch(/stone-850/);
      expect(src).not.toMatch(/stone-150/);
    }
  });

  it("the five themed surfaces stay on the dark shell palette", () => {
    const files = [
      "src/lazy/portal.users.index.page.tsx",
      "src/lazy/portal.reports.index.page.tsx",
      "src/lazy/portal.tasks.index.page.tsx",
      "src/lazy/portal.communications.index.page.tsx",
    ];
    for (const rel of files) {
      const src = readFileSync(P(rel), "utf8");
      expect(src).not.toMatch(/bg-white rounded-3xl/);
      expect(src).not.toMatch(/text-3xl font-black text-stone-900/);
      expect(src).not.toMatch(/border-stone-(100|150|200)/);
    }
    // Dark-on-dark H1 contrast fix also covers approvals + industries.
    const approvals = readFileSync(P("src/lazy/portal.approvals.index.page.tsx"), "utf8");
    expect(approvals).not.toMatch(/text-3xl font-black text-stone-900/);
    const industries = readFileSync(P("src/lazy/portal.industries.index.page.tsx"), "utf8");
    expect(industries).not.toMatch(/text-3xl font-black text-stone-900/);
  });
});