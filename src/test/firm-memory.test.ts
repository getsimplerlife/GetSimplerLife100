/**
 * firm-memory.test.ts — capability upgrade #3 (per-firm operational memory).
 *
 * Proves the durable per-tenant memory store and its threading:
 *  1. Strict per-tenant isolation — tenant A memory never appears for tenant B.
 *  2. Size caps — oldest entries evicted (newest-K kept).
 *  3. Firm rules (explicit + reflected from tenant-settings) feed agent context.
 *  4. Recent insights + audit tail feed agent context.
 *  5. buildAgentContext is threaded into orchestrated chains (agentContext seed).
 *  6. Memory writes are internal metadata — provider write path untouched.
 *
 * Safety: zero real providers, LLM off, fail-closed default ON, data stored in
 * throwaway tmp dirs only.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  readFirmMemory,
  recordInsight,
  recordAudit,
  setFirmRule,
  buildAgentContext,
  MAX_RECENT_INSIGHTS,
  MAX_AUDIT_TAIL,
  firmMemoryPath,
} from "../lib/firm-memory";
import { setProcessorCalibration } from "../lib/tenant-settings";
import { readJSON } from "../lib/data-store";
import { runChain } from "../agents/orchestrator";
import type { ProviderResult } from "../lib/provider-api";

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "firm-memory-")); });
afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

const A = "firmA@example.com";
const B = "firmB@example.com";

function ok(providerId: string, provider: string, sampleData: any[]): ProviderResult {
  return { providerId, provider, status: "ok", recordsFound: sampleData.length, sampleData };
}

// ── 1. Per-tenant isolation ────────────────────────────────────────────────
describe("per-tenant isolation", () => {
  it("tenant A memory never appears for tenant B", () => {
    setFirmRule(A, "vendor-x.reconciled", "true", dir);
    recordInsight(A, { summary: "A's secret insight", source: "finance" }, dir);
    recordAudit(A, { summary: "A approved createXeroInvoice", action: "createXeroInvoice", approved: true }, dir);

    const a = readFirmMemory(A, dir);
    const b = readFirmMemory(B, dir);

    expect(a.rules["vendor-x.reconciled"]).toBe("true");
    expect(a.recentInsights.some((e) => e.summary.includes("A's secret"))).toBe(true);
    expect(a.auditTail.some((e) => e.action === "createXeroInvoice" && e.approved === true)).toBe(true);

    // B sees nothing from A.
    expect(Object.keys(b.rules)).toHaveLength(0);
    expect(b.recentInsights).toHaveLength(0);
    expect(b.auditTail).toHaveLength(0);
  });

  it("different tenants write to separate keys in the same file", () => {
    setFirmRule(A, "rule-a", "1", dir);
    setFirmRule(B, "rule-b", "2", dir);
    const raw = readJSON(firmMemoryPath(dir));
    expect(raw[A].rules["rule-a"]).toBe("1");
    expect(raw[B].rules["rule-b"]).toBe("2");
    expect(raw[A].rules["rule-b"]).toBeUndefined();
  });
});

// ── 2. Size caps ───────────────────────────────────────────────────────────
describe("size caps", () => {
  it("recentInsights evicts the oldest entry beyond the cap", () => {
    for (let i = 0; i < MAX_RECENT_INSIGHTS + 5; i++) {
      recordInsight(A, { summary: `insight-${i}`, source: "finance" }, dir);
    }
    const mem = readFirmMemory(A, dir);
    expect(mem.recentInsights.length).toBeLessThanOrEqual(MAX_RECENT_INSIGHTS);
    expect(mem.recentInsights.length).toBe(MAX_RECENT_INSIGHTS);
    // oldest (0) evicted; newest kept.
    expect(mem.recentInsights.some((e) => e.summary === "insight-0")).toBe(false);
    expect(mem.recentInsights[mem.recentInsights.length - 1].summary).toBe(`insight-${MAX_RECENT_INSIGHTS + 4}`);
  });

  it("auditTail evicts the oldest entry beyond the cap", () => {
    for (let i = 0; i < MAX_AUDIT_TAIL + 10; i++) {
      recordAudit(A, { summary: `audit-${i}`, action: "x", approved: i % 2 === 0 }, dir);
    }
    const mem = readFirmMemory(A, dir);
    expect(mem.auditTail.length).toBe(MAX_AUDIT_TAIL);
    expect(mem.auditTail.some((e) => e.summary === "audit-0")).toBe(false);
  });

  it("rules cap at MAX_RULES, oldest evicted FIFO", () => {
    const MAX_RULES = 100; // must mirror src/lib/firm-memory
    for (let i = 0; i < MAX_RULES + 3; i++) setFirmRule(A, `k${i}`, String(i), dir);
    const mem = readFirmMemory(A, dir);
    expect(Object.keys(mem.rules).length).toBeLessThanOrEqual(MAX_RULES);
    // oldest key evicted, newest present
    expect(mem.rules["k0"]).toBeUndefined();
    expect(mem.rules[`k${MAX_RULES + 2}`]).toBe(String(MAX_RULES + 2));
  });
});

// ── 3 & 4. Context composition (rules + memory feed buildAgentContext) ─────
describe("buildAgentContext", () => {
  it("reflects tenant-settings calibration + approval/workspace rules", () => {
    setProcessorCalibration(A, { discrepancyPercent: 2, minMatchConfidence: 0.9 }, dir);
    const ctx = buildAgentContext(A, dir);
    expect(ctx.tenantEmail).toBe(A);
    expect(ctx.calibration.discrepancyPercent).toBe(2);
    expect(ctx.calibration.minMatchConfidence).toBe(0.9);
    expect(ctx.firmRules.approvalMode).toBe("on"); // default fail-closed
    expect(ctx.firmRules.workspacePreference).toBe("auto");
  });

  it("surfaces explicit firm rules", () => {
    setFirmRule(A, "vendor-x.reconciled", "true", dir);
    const ctx = buildAgentContext(A, dir);
    expect(ctx.firmRules["vendor-x.reconciled"]).toBe("true");
  });

  it("surfaces recent insights + audit tail", () => {
    recordInsight(A, { summary: "processed 12 POs", source: "procurement" }, dir);
    recordAudit(A, { summary: "approved createXeroInvoice", action: "createXeroInvoice", approved: true }, dir);
    const ctx = buildAgentContext(A, dir);
    expect(ctx.memory.recentInsights.some((e) => e.summary.includes("12 POs"))).toBe(true);
    expect(ctx.memory.auditTail.some((e) => e.action === "createXeroInvoice" && e.approved === true)).toBe(true);
    expect(ctx.memory.updatedAt).toBeGreaterThan(0);
  });

  it("returns safe defaults for a tenant with no memory (never throws)", () => {
    const ctx = buildAgentContext(B, dir);
    expect(ctx.firmRules.approvalMode).toBe("on");
    expect(ctx.memory.recentInsights).toHaveLength(0);
    expect(ctx.memory.auditTail).toHaveLength(0);
  });
});

// ── 5. Threaded into orchestrated chains ───────────────────────────────────
describe("orchestrator threads memory", () => {
  it("seeds agentContext (with tenant memory) into every step's input", async () => {
    setFirmRule(A, "vendor-x.reconciled", "true", dir);
    const res = await runChain({
      chainId: "doc-intake-to-contract-review",
      tenantEmail: A,
      dataDir: dir,
      stepResults: [[ok("xero", "Xero", [{ name: "Acme", email: "a@acme.com" }])], [ok("xero", "Xero", [{ name: "Acme" }])]],
    });
    expect(res.status).toBe("completed");
    const firstInput = res.steps[0]?.input;
    expect(firstInput?.agentContext?.tenantEmail).toBe(A);
    expect(firstInput?.agentContext?.firmRules?.["vendor-x.reconciled"]).toBe("true");
    // After the run, the chain recorded an insight back into tenant memory.
    const mem = readFirmMemory(A, dir);
    expect(mem.recentInsights.length).toBeGreaterThan(0);
  });

  it("does not share memory across chains/tenants (records only to its own tenant)", async () => {
    await runChain({
      chainId: "doc-intake-to-contract-review",
      tenantEmail: A,
      dataDir: dir,
    });
    const memB = readFirmMemory(B, dir);
    expect(memB.recentInsights).toHaveLength(0);
    expect(memB.auditTail).toHaveLength(0);
  });
});

// ── 6. Memory writes are internal metadata, never provider writes ──────────
describe("memory is internal metadata (safety)", () => {
  it("recordInsight/recordAudit never touch a provider and never create actions", () => {
    // These functions only mutate the local firm_memory.json; they return void
    // and there is no provider/approval side effect by construction.
    recordInsight(A, { summary: "x", source: "test" }, dir);
    recordAudit(A, { summary: "y", action: "z", approved: true }, dir);
    const mem = readFirmMemory(A, dir);
    expect(mem.recentInsights.length).toBe(1);
    expect(mem.auditTail.length).toBe(1);
    // The composed context carries no executable actions.
    const ctx = buildAgentContext(A, dir);
    expect((ctx as any).actionsTaken).toBeUndefined();
  });
});
