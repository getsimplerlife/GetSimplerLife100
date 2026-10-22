/**
 * portal-rework-regression.test.ts — P0 portal rework (owner 10-22) guardrail.
 * Pins the approved audit outcomes P0-1..P0-4 so they cannot silently regress:
 *   - duplicate routes/pages deleted (dashboards, knowledge-base, chat) stay
 *     ABSENT — same pattern as the retired /audit guardrails;
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
  "src/routes/portal.dashboards.index.tsx",
  "src/lazy/portal.dashboards.index.page.tsx",
  "src/routes/portal.knowledge-base.index.tsx",
  "src/lazy/portal.knowledge-base.index.page.tsx",
  "src/routes/portal.chat.index.tsx",
  "src/lazy/portal.chat.index.page.tsx",
];

describe("P0 portal rework guardrails (owner 10-22)", () => {
  it("duplicate dashboard / KB / chat routes and pages no longer exist", () => {
    for (const rel of DELETED_ROUTES) {
      expect(existsSync(P(rel)), `${rel} should be deleted`).toBe(false);
    }
    // Keeper routes survive.
    expect(existsSync(P("src/routes/portal.dashboards.index.tsx"))).toBe(false);
    expect(existsSync(P("src/routes/portal.knowledgebase.index.tsx"))).toBe(true);
    expect(existsSync(P("src/routes/portal.import.index.tsx"))).toBe(true);
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
      "name: \"Inbox\"",
    ]) {
      expect(shell).toContain(p);
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
      "src/lazy/portal.training.index.page.tsx",
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
      "src/lazy/portal.training.index.page.tsx",
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