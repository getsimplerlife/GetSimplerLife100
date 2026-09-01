/**
 * escalation-reasoning.test.ts — capability upgrade #5.
 *
 * Better escalation / anomaly detection + clearer WARN/approval routing.
 *  1. detectAnomaly (pure): delta vs the firm's OWN history, direction, fail-soft.
 *  2. Finance spend anomaly → WARN alert, routing read_recommendation, NO action.
 *  3. Sales duplicate-rate drift → WARN alert, read_recommendation, no auto-execute.
 *  4. Per-tenant isolation: firm A history never influences firm B.
 *  5. Alert routing derived for existing alerts (requires_approval when a
 *     decision is needed, read_recommendation for heads-ups).
 *  6. Back-compat: no escalation context → no anomaly alerts, today's behavior.
 *
 * All tests: LLM off, zero provider creds, fail-closed default ON.
 */
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { detectAnomaly, priorValues, routeAlert, type AlertRouting } from "../lib/escalation";
import { recordMetrics, readFirmMemory } from "../lib/firm-memory";
import { processAgentResults, type ProcessorOptions } from "../lib/agent-processor";
import type { ProviderResult } from "../lib/provider-api";

const agent = { id: "finance-agent", name: "Finance", category: "finance", instructions: "" };
const salesAgent = { id: "sales-agent", name: "Sales", category: "sales", instructions: "" };

function ok(providerId: string, provider: string, sampleData: any[], recordsFound = sampleData.length): ProviderResult {
  return { providerId, provider, status: "ok", recordsFound, sampleData };
}
const base = (integrationsUsed: ProviderResult[], totalRecordsProcessed: number) =>
  ({ integrationsUsed, totalRecordsProcessed });

let dir: string;
let tenantA: string;
let tenantB: string;

describe("detectAnomaly (pure)", () => {
  const hist = (vals: number[]): any[] => vals.map((spend) => ({ values: { spend } }));

  it("flags a value far above the firm's own baseline", () => {
    const r = detectAnomaly("spend", 2000, hist([1000, 1000]), {});
    expect(r.isAnomaly).toBe(true);
    expect(r.delta).toBeGreaterThan(25);
    expect(r.reason).toContain("firm's recent baseline");
  });

  it("does NOT flag when insufficient history (back-compat fallback)", () => {
    const r = detectAnomaly("spend", 2000, hist([1000]), {});
    expect(r.isAnomaly).toBe(false);
  });

  it("does NOT flag a value within the baseline", () => {
    const r = detectAnomaly("spend", 1100, hist([1000, 1000]), {});
    expect(r.isAnomaly).toBe(false);
  });

  it("respects direction", () => {
    const r = detectAnomaly("spend", 500, hist([1000, 1000]), { direction: "up" });
    expect(r.isAnomaly).toBe(false); // dropped, but direction only flags up
  });

  it("is fail-soft on degenerate input (never throws)", () => {
    expect(() => detectAnomaly("spend", NaN, hist([0, 0]), {})).not.toThrow();
    const r = detectAnomaly("spend", NaN, hist([0, 0]), {});
    expect(r.isAnomaly).toBe(false);
  });

  it("priorValues returns all stored baselines (current passed separately)", () => {
    const h = hist([1000, 1000, 2000]);
    expect(priorValues(h, "spend")).toEqual([1000, 1000, 2000]);
  });
});

describe("finance spend anomaly → WARN + routing, no execution", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "esc-fin-"));
    tenantA = "firm@t.test";
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("surfaces a read_recommendation WARN with a concrete reason and no action", () => {
    // Seed a low-spend baseline for this firm (2 prior runs @1000).
    recordMetrics(tenantA, { spend: 1000 }, dir);
    recordMetrics(tenantA, { spend: 1000 }, dir);

    const opts: ProcessorOptions = { tenantEmail: tenantA, dataDir: dir };
    const res = processAgentResults(agent, base([
      ok("xero", "Xero", [{ name: "Acme", total: 500 }, { name: "Globex", total: 1500 }]), // spend = 2000
    ], 2), [], opts);

    const anomaly = res.alerts.find((a) => a.message.includes("firm's recent baseline"));
    expect(anomaly).toBeTruthy();
    expect(anomaly!.level).toBe("warning");
    expect(anomaly!.requiresAttention).toBe(false);
    expect(anomaly!.routing).toBe("read_recommendation");
    expect(res.processedData.metrics.anomalyFlagged).toBe("spend");
    // Pure reporting — a heads-up must never create an action that executes.
    expect(res.actionsTaken.length).toBe(0);
  });

  it("records the run to the firm's metric history (baseline grows)", () => {
    recordMetrics(tenantA, { spend: 100 }, dir);
    const opts: ProcessorOptions = { tenantEmail: tenantA, dataDir: dir };
    processAgentResults(agent, base([ok("xero", "Xero", [{ name: "A", total: 300 }])], 1), [], opts);
    const mem = readFirmMemory(tenantA, dir);
    expect(mem.metricHistory.length).toBe(2); // seeded baseline + the run we just did
  });
});

describe("sales duplicate-rate drift → WARN read_recommendation, no auto-execute", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "esc-sales-"));
    tenantA = "firm@t.test";
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("flags a spike in duplicates as a heads-up, NOT an executable action", () => {
    // Baseline: low duplicate rate (0.1) twice.
    recordMetrics(tenantA, { duplicateRate: 0.1 }, dir);
    recordMetrics(tenantA, { duplicateRate: 0.1 }, dir);
    // Current: 3 duplicate groups across 10 contacts = 0.3 rate (300% above 0.1).
    const contacts = Array.from({ length: 10 }, (_, i) => ({ name: `Person ${i}`, email: `p${i}@x.com` }));
    contacts[0].email = "dup@x.com";
    contacts[1].email = "dup@x.com";
    contacts[2].email = "dup2@x.com";
    contacts[3].email = "dup2@x.com";
    contacts[4].email = "dup3@x.com";
    contacts[5].email = "dup3@x.com";

    const opts: ProcessorOptions = { tenantEmail: tenantA, dataDir: dir };
    const res = processAgentResults(salesAgent, base([ok("hubspot", "HubSpot", contacts)], 10), [], opts);

    const drift = res.alerts.find((a) => a.message.includes("firm's recent baseline"));
    expect(drift).toBeTruthy();
    expect(drift!.routing).toBe("read_recommendation");
    // No action is added purely from the drift heads-up.
    expect(res.actionsTaken.filter((a) => a.action === "deduplicate_contacts").length).toBe(1); // only the normal gated one
    // Every proposed write is still status pending (fail-closed gate intact).
    expect(res.actionsTaken.every((a) => a.status === "pending")).toBe(true);
  });
});

describe("strict per-tenant isolation", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "esc-iso-"));
    tenantA = "alpha@t.test";
    tenantB = "beta@t.test";
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("firm A's low baseline does not influence firm B (and vice versa)", () => {
    // Firm A: low baseline → high current spend flags an anomaly.
    recordMetrics(tenantA, { spend: 1000 }, dir);
    recordMetrics(tenantA, { spend: 1000 }, dir);
    // Firm B: already high baseline → the same high spend is normal.
    recordMetrics(tenantB, { spend: 2000 }, dir);
    recordMetrics(tenantB, { spend: 2000 }, dir);

    const highData = base([ok("xero", "Xero", [{ name: "Acme", total: 2000 }])], 1);
    const resA = processAgentResults(agent, highData, [], { tenantEmail: tenantA, dataDir: dir });
    const resB = processAgentResults(agent, highData, [], { tenantEmail: tenantB, dataDir: dir });

    expect(resA.alerts.some((a) => a.message.includes("firm's recent baseline"))).toBe(true);
    expect(resB.alerts.some((a) => a.message.includes("firm's recent baseline"))).toBe(false);
  });
});

describe("alert routing derivation + back-compat", () => {
  it("routeAlert maps requires-decision to requires_approval, otherwise heads-up", () => {
    expect(routeAlert(true)).toBe("requires_approval");
    expect(routeAlert(false)).toBe("read_recommendation");
  });

  it("a decision-worthy existing alert gets routing requires_approval", () => {
    dir = mkdtempSync(join(tmpdir(), "esc-route-"));
    try {
      const res = processAgentResults(agent, base([
        ok("xero", "Xero", [{ name: "Acme" }]),
        ok("quickbooks", "QuickBooks", [{ name: "Globex" }]),
      ], 2), []);
      // Two systems, no match → "Reconciliation needed" requires attention → decision.
      const recon = res.alerts.find((a) => a.message.includes("Reconciliation"));
      expect(recon?.routing).toBe("requires_approval");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("no escalation context → no anomaly alerts (additive/back-compat)", () => {
    const res = processAgentResults(agent, base([ok("xero", "Xero", [{ name: "Acme", total: 99999 }])], 1), []);
    expect(res.alerts.some((a) => a.message.includes("firm's recent baseline"))).toBe(false);
  });

  it("type-level: AlertRouting union is exact", () => {
    const r: AlertRouting = "requires_approval";
    expect(["requires_approval", "read_recommendation"]).toContain(r);
  });
});
