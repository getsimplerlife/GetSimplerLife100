import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * portal-legacy-sweep-guard.test.tsx — P2-6 legacy portal-surface sweep guard.
 * Pins the audit outcomes of the four legacy surfaces so they cannot silently
 * regress to theater:
 *   - Reports: read-only real-store view — no fake generate/download flows.
 *   - Tasks: read-only real-store view — no junk-write POSTs, no writes at all.
 *   - Workflows: real store GET/POST/DELETE only — no demo-template preload,
 *     no retired purchases/employees refs, no junk test-write.
 *   - Admin Analytics: owner-gated real endpoint with the correct keys.
 * Absence pins target CODE patterns (fetch methods/actions/endpoints).
 */

const P = (rel: string) => join(process.cwd(), rel);

const reports = readFileSync(P("src/lazy/portal.reports.index.page.tsx"), "utf8");
const tasks = readFileSync(P("src/lazy/portal.tasks.index.page.tsx"), "utf8");
const workflows = readFileSync(P("src/lazy/portal.workflows.index.page.tsx"), "utf8");
const admin = readFileSync(P("src/lazy/portal.admin.analytics.page.tsx"), "utf8");

const FOUR = [reports, tasks, workflows, admin];

describe("P2-6 legacy portal-surface sweep", () => {
  it("routes the four legacy pages to REAL endpoints only", () => {
    expect(reports).toContain('"/api/data/reports"');
    expect(tasks).toContain('"/api/data/tasks"');
    expect(workflows).toContain('"/api/data/workflows"');
    expect(admin).toContain('"/api/admin/analytics"');
  });

  it("removes the dead analytics and retired-store refs", () => {
    expect(admin).not.toContain('"/api/data/analytics"');
    expect(workflows).not.toContain("/api/purchases");
    expect(workflows).not.toContain("/api/data/employees");
  });

  it("reports page has no write, no theater generate, no fake download", () => {
    expect(reports).not.toMatch(/method:\s*"POST"/);
    expect(reports).not.toMatch(/method:\s*"DELETE"/);
    expect(reports).not.toMatch(/onClick=\{async/);
    expect(reports).not.toMatch(/action:\s*"report_/);
    expect(reports).toContain("No reports yet");
    expect(reports).toContain("Sign in to see your reports.");
    expect(reports).toContain("isn't available from this page yet");
  });

  it("tasks page is read-only over the real store with honest parsing", () => {
    expect(tasks).not.toMatch(/method:\s*"POST"/);
    expect(tasks).not.toMatch(/method:\s*"DELETE"/);
    expect(tasks).not.toContain("fetch(");
    expect(tasks).toContain("usePortalDashboard");
    expect(tasks).toContain("recordAt(");
    expect(tasks).toContain("recordStatus(");
    expect(tasks).toContain("recordSummary(");
    expect(tasks).toContain("read-only");
    expect(tasks).toContain("No task or workflow run records yet");
    expect(tasks).toContain("Sign in to see your tasks.");
  });

  it("workflows page keeps only real store actions and honest rows", () => {
    expect(workflows).not.toContain("WORKFLOW_TEMPLATES");
    expect(workflows).not.toContain("/api/purchases");
    expect(workflows).not.toContain("/api/data/employees");
    expect(workflows).not.toMatch(/action:\s*"workflow_test"/);
    expect(workflows).toContain('method: "DELETE"');
    expect(workflows).toContain("/portal/workflows/builder");
    expect(workflows).toContain("No workflows in this workspace yet");
    expect(workflows).toContain("Sign in to see your workflows.");
    expect(workflows).toContain("applied to the real store");
  });

  it("admin analytics maps the real server keys", () => {
    expect(admin).toContain("serverUptime");
    expect(admin).not.toContain("stats.uptime");
    expect(admin).toContain("totalAgents");
    expect(admin).toContain("totalAgentRuns");
    expect(admin).not.toContain("342K");
    expect(admin).not.toContain("pct: 45");
    expect(admin).not.toContain("totalCalls");
    expect(admin).toContain("aren't available yet");
    expect(admin).toContain("owner view");
  });

  it("all four pages stay on the dark palette (no light-theme remnants)", () => {
    for (const src of FOUR) {
      expect(src).not.toMatch(/stone-850/);
      expect(src).not.toMatch(/stone-150/);
      expect(src).not.toMatch(/bg-white/);
      expect(src).not.toMatch(/text-3xl font-black text-stone-900/);
      expect(src).not.toMatch(/border-stone-(100|150|200)/);
      expect(src).not.toMatch(/[⚙️📊📋🧹🚀🔍📝]/);
    }
  });

  it("all four pages are free of banned agent-era and retired-era vocabulary", () => {
    for (const src of FOUR) {
      expect(src).not.toMatch(
        /AI Operations Team|AI coworkers|AI Employee|AI agent\(s\)|AI workforce/i
      );
      expect(src).not.toMatch(
        /14AbJ|4gMfZ|\$?2,?500 Automation|Industry Blueprint|Deep-Dive AI|Connection Pack|3cI8wR88|5kQ6oJbl|aFa7sN60/
      );
      expect(src).not.toMatch(/will populate automatically/i);
    }
  });
});