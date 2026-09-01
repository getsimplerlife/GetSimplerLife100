/**
 * agent-processor-reasoning.test.ts — capability upgrade #2.
 *
 * Sharper deterministic reasoning in src/lib/agent-processor.ts:
 *  1. Confidence-scored cross-system matching (email > name-variant > phone).
 *  2. Fuzzy-normalized dedup (casing / initials / company fillers).
 *  3. Calibrated discrepancy thresholds driven by tenant-settings.
 *  4. Cross-record joins across already-queried systems.
 *  5. Back-compat: exact matches still detected; procurement/inventory paths
 *     unchanged; actions are ONLY ever proposed as pending (never executed).
 *
 * All tests: zero real providers, LLM off, fail-closed default ON.
 */
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { processAgentResults, type ProcessorOptions } from "../lib/agent-processor";
import { scoreEntityMatch, tokenOverlap, vendorNorm, fuzzyDuplicates } from "../lib/match";
import { setProcessorCalibration, getProcessorCalibration, DEFAULT_PROCESSOR_CALIBRATION } from "../lib/tenant-settings";
import type { ProviderResult } from "../lib/provider-api";

const agent = { id: "finance-agent", name: "Finance", category: "finance", instructions: "" };

function ok(providerId: string, provider: string, sampleData: any[], recordsFound = sampleData.length): ProviderResult {
  return { providerId, provider, status: "ok", recordsFound, sampleData };
}

const base = (integrationsUsed: ProviderResult[], totalRecordsProcessed: number) =>
  ({ integrationsUsed, totalRecordsProcessed });

// ── 1. Confidence-scored matching ─────────────────────────────────────────
describe("match.scoreEntityMatch", () => {
  it("weights email above name variant", () => {
    const sc = scoreEntityMatch(
      { name: "Acme Ltd", email: "billing@acme.com" },
      { companyName: "Acme Limited", email: "BILLING@acme.com" },
    );
    expect(sc.matchedOn).toContain("email");
    expect(sc.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("matches identical names with high confidence", () => {
    const sc = scoreEntityMatch({ name: "Acme Corporation" }, { companyName: "ACME corp" });
    expect(sc.matchedOn).toContain("name");
    expect(sc.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("matches initial variants for people", () => {
    const sc = scoreEntityMatch({ Name: "John Smith" }, { Name: "J. Smith" });
    // nameVariant signal (initials) — above the fuzzy dedupe default.
    expect(sc.matchedOn).toContain("nameVariant");
    expect(sc.confidence).toBeGreaterThanOrEqual(0.65);
  });

  it("does not match unrelated records", () => {
    const sc = scoreEntityMatch({ name: "Acme" }, { name: "Globex", email: "a@b.com" });
    expect(sc.confidence).toBe(0);
  });

  it("matches on phone alone when present on both", () => {
    const sc = scoreEntityMatch({ Name: "Alan", PhoneNumber: "555-0134" }, { Name: "Bill", phone: "5550134" });
    expect(sc.matchedOn).toContain("phone");
    expect(sc.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

describe("finance processor confidence scoring", () => {
  it("matches records by normalized email even when names differ (back-compat exact still found)", () => {
    const res = processAgentResults(agent, base([
      ok("xero", "Xero", [{ name: "Acme Ltd", email: "billing@acme.com", total: 1000 }]),
      ok("quickbooks", "QuickBooks", [{ companyName: "Acme Limited", email: "BILLING@ACME.COM", total: 1000 }]),
    ], 2), []);

    const pair = res.processedData.matched.flatMap((m) => m.matches);
    expect(pair.length).toBeGreaterThanOrEqual(1);
    expect(pair[0].confidence).toBeGreaterThanOrEqual(0.9);
    expect(res.processedData.metrics.scoredMatches).toBeGreaterThanOrEqual(1);
  });

  it("does NOT emit a match when confidence is below the minimum", () => {
    const res = processAgentResults(agent, base([
      ok("xero", "Xero", [{ name: "Acme" }]),
      ok("quickbooks", "QuickBooks", [{ name: "Globex" }]),
    ], 2), []);

    expect(res.processedData.matched.flatMap((m) => m.matches).length).toBe(0);
    // No match found across two systems → discrepancy alert + reconcile action.
    expect(res.alerts.some((a) => a.message.includes("Reconciliation"))).toBe(true);
    expect(res.actionsTaken.some((a) => a.action === "reconcile_records" && a.status === "pending")).toBe(true);
  });

  it("flags a calibrated amount discrepancy on a matched pair", () => {
    const res = processAgentResults(agent, base([
      ok("xero", "Xero", [{ name: "Acme Ltd", email: "b@acme.com", total: 1200 }]),
      ok("quickbooks", "QuickBooks", [{ name: "Acme Ltd", email: "b@acme.com", total: 1000 }]),
    ], 2), []);

    const pair = res.processedData.matched.flatMap((m) => m.matches);
    const withDisc = pair.find((p) => p.discrepancy);
    expect(withDisc).toBeTruthy(); // |1200-1000|/1000 = 20% > default 5%
    expect(Number(withDisc.discrepancy.pct)).toBeGreaterThan(5);
    expect(res.alerts.some((a) => a.message.includes("amount calibration threshold"))).toBe(true);
  });
});

// ── 2. Dedup edge cases ───────────────────────────────────────────────────
describe("sales processor fuzzy + exact dedup", () => {
  const salesAgent = { id: "sales-agent", name: "Sales", category: "sales", instructions: "" };

  it("catches exact casing duplicates and near-matches (initials / fillers)", () => {
    const res = processAgentResults(salesAgent, base([
      ok("hubspot", "HubSpot", [
        { name: "Acme Inc", email: "a@acme.com" },
        { name: "John Smith" },
        { name: "Globex LLC" },
      ]),
      ok("salesforce", "Salesforce", [
        { name: "ACME", email: "a@acme.com" },   // exact email dup
        { name: "J. Smith" },                     // initial variant
        { name: "Globex" },                       // filler-stripped variant
      ]),
    ], 6), []);

    const matches = res.processedData.matched.flatMap((m) => m.matches);
    expect(matches.length).toBeGreaterThanOrEqual(3);
    expect(res.processedData.metrics.duplicates).toBeGreaterThanOrEqual(3);
    // An exact email dedupe is confidence 1 (back-compat preserved).
    expect(matches.some((m) => m.confidence === 1 && m.dedupeKey && m.dedupeKey === "a@acme.com")).toBe(true);
    // Near-matches are tagged fuzzy with a confidence < 1.
    expect(matches.some((m) => m.fuzzy === true && m.confidence < 1)).toBe(true);
  });

  it("fuzzyDuplicates helper stays bounded and reports variant pairs", () => {
    const recs = [
      { Name: "Acme Inc" },
      { Name: "ACME" },
      { Name: "Globex" },
    ];
    const pairs = fuzzyDuplicates(recs, { minConfidence: 0.6 });
    expect(pairs.some((p) => p.confidence >= 0.6)).toBe(true);
  });
});

// ── 3. Calibration driven by tenant-settings ─────────────────────────────
describe("tenant calibration", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "calib-")); });
  afterEach(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} });

  it("getProcessorCalibration returns defaults when unset", () => {
    expect(getProcessorCalibration("none@t.test", dir)).toEqual(DEFAULT_PROCESSOR_CALIBRATION);
  });

  it("a tighter discrepancy threshold surfaces an amount alert that the default misses", () => {
    // amount diff 3%: default threshold (5%) does NOT flag; calibrated 1% DOES.
    const records = base([
      ok("xero", "Xero", [{ name: "Acme", email: "x@acme.com", total: 1030 }]),
      ok("quickbooks", "QuickBooks", [{ name: "Acme", email: "x@acme.com", total: 1000 }]),
    ], 2);

    const opts: ProcessorOptions = { tenantEmail: "firm@t.test", dataDir: dir };
    const loose = processAgentResults(agent, records, [], opts); // default 5%
    expect(loose.alerts.some((a) => a.message.includes("amount calibration threshold"))).toBe(false);

    setProcessorCalibration("firm@t.test", { discrepancyPercent: 1 }, dir);
    const tight = processAgentResults(agent, records, [], opts);
    expect(tight.alerts.some((a) => a.message.includes("amount calibration threshold"))).toBe(true);
  });

  it("a higher min confidence rejects name-variant matches", () => {
    const records = base([
      ok("xero", "Xero", [{ Name: "John Smith" }]),
      ok("quickbooks", "QuickBooks", [{ Name: "J. Smith" }]),
    ], 2);
    const opts: ProcessorOptions = { tenantEmail: "firm@t.test", dataDir: dir };
    setProcessorCalibration("firm@t.test", { minMatchConfidence: 0.9 }, dir);
    const res = processAgentResults(agent, records, [], opts);
    // nameVariant conf ~0.65 < 0.9 → no match.
    expect(res.processedData.matched.flatMap((m) => m.matches).length).toBe(0);
  });
});

// ── 4. Cross-record joins ────────────────────────────────────────────────
describe("cross-record joins", () => {
  it("finance processor emits a quote-to-cash join insight when emails link systems", () => {
    const res = processAgentResults(agent, base([
      ok("xero", "Xero", [{ name: "Acme Ltd", email: "billing@acme.com" }]),
      ok("hubspot", "HubSpot", [{ email: "billing@acme.com", status: "open_deal" }]),
    ], 2), []);
    expect(res.processedData.metrics.joinedRecords).toBeGreaterThanOrEqual(1);
    expect(res.insights.some((i) => i.message.includes("quote-to-cash"))).toBe(true);
  });
});

// ── 5. Safety + back-compat ──────────────────────────────────────────────
describe("safety + back-compat", () => {
  it("writes are only ever proposed as pending — no execution, no provider calls", () => {
    const invoke = vi.fn();
    const before = (globalThis as any).fetch;
    (globalThis as any).fetch = invoke;
    try {
      const res = processAgentResults(
        { id: "sales-agent", name: "Sales", category: "sales", instructions: "" },
        base([
          ok("hubspot", "HubSpot", [{ name: "Acme Inc", email: "a@acme.com" }]),
          ok("salesforce", "Salesforce", [{ name: "ACME", email: "a@acme.com" }]),
        ], 2),
        [],
      );
      // Every proposal is pending; nothing executed.
      for (const a of res.actionsTaken) expect(a.status).toBe("pending");
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      (globalThis as any).fetch = before;
    }
  });

  it("operations/inventory + procurement paths are unchanged (back-compat)", () => {
    // inventory (operations) still emits a pending create_reorder with providerId.
    const inv = processAgentResults(
      { id: "inventory-tracker-v1", name: "Inventory Tracker", category: "operations", instructions: "" },
      base([ok("shopify", "Shopify", [{ id: "w1", title: "Widget", inventory: 4 }])], 1),
      [],
    );
    const reorder = inv.actionsTaken.find((a) => a.action === "create_reorder");
    expect(reorder).toBeTruthy();
    expect(reorder.providerId).toBe("shopify");
    expect(reorder.status).toBe("pending");

    // procurement still validates explicit PO objects.
    const poc = processAgentResults(
      { id: "po-agent", name: "PO", category: "procurement", instructions: "" },
      base([ok("quickbooks", "QuickBooks", [{ id: "PO-1", vendorName: "Acme", totalAmount: 120, status: "pending" }])], 1),
      [],
    );
    expect(poc.processedData.metrics.totalOrders).toBe(1);
    expect(poc.actionsTaken).toEqual([]);
  });

  it("vendorNorm strips company fillers deterministically", () => {
    expect(vendorNorm("Acme Corporation Inc.")).toBe("acme");
    expect(vendorNorm("Globex LLC")).toBe("globex");
  });
});
