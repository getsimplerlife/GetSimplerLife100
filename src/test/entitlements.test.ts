/**
 * entitlements.test.ts — slice 142: TIER ENFORCEMENT.
 *
 * What this file pins:
 *   1. the DECISION (src/lib/entitlements.ts) — tier resolution from the
 *      stores, the failure directions, the import quota, the feature checks;
 *   2. the APPROVED numbers — Starter 10k rows / Growth 100k / Enterprise
 *      custom, control plane Growth+, adapters Growth 3 / Enterprise all;
 *   3. the GATES actually call the helper (file import commit, provider import
 *      commit + apply, autonomy enablement, approvals auto-mode) — a limit that
 *      is stated but not enforced is the defect this slice exists to fix;
 *   4. the PRINCIPLE: the core quote-to-cash chain, the free primitives and the
 *      approvals queue are included in EVERY tier — an enforcement that would
 *      block a paying Starter customer's own invoice is a bug;
 *   5. the portal billing page renders its limits from the same helper and no
 *      longer claims every plan includes everything.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TIER_SPECS,
  checkFeature,
  checkImportQuota,
  countImportRowsInMonth,
  describeEntitlement,
  monthKeyOf,
  normalizeTier,
  resolveEntitlement,
  tierFromAmountCents,
  tierSummary,
} from "../lib/entitlements";
import { checkImportAllowed, currentMonthKey, importRowsUsedThisMonth, loadEntitlement, requireFeature } from "../lib/entitlement-store";
import { readJSON, writeJSON } from "../lib/data-store";
import { submitFileImportWrite, executeCommit } from "../native/fileimport/gate";
import { getJob } from "../native/fileimport/store";
import { createTable, listRows } from "../native/tables/store";
import type { TableDef } from "../native/tables/types";

const STARTER = "starter-tenant@example.test";
const GROWTH = "growth-tenant@example.test";
const ENTERPRISE = "enterprise-tenant@example.test";
const NO_PLAN = "registered-no-plan@example.test";
const TABLE_ID = "tbl_entitlement01";

let dataDir = "";

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "entitlements-"));
});
afterEach(() => {
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* best-effort */ }
});

function seedTable(tenantId: string): TableDef {
  const now = new Date().toISOString();
  const table: TableDef = {
    id: TABLE_ID,
    tenantId,
    name: "Clients",
    description: "",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
    ],
    version: 1,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
  };
  createTable(dataDir, table);
  return table;
}

function seedPurchases(rows: Record<string, any[]>) {
  writeJSON(join(dataDir, "tenant_purchases.json"), rows);
}

function seedCommittedJob(tenantId: string, committedCount: number, committedAt = new Date().toISOString()) {
  const path = join(dataDir, "file_import_jobs.json");
  const all = readJSON(path) && typeof readJSON(path) === "object" ? readJSON(path) : {};
  const arr = Array.isArray(all[tenantId]) ? all[tenantId] : [];
  arr.push({
    id: `fimp_seed_${arr.length}`,
    tenantId,
    name: "seeded import",
    target: { kind: "table", tableId: TABLE_ID },
    format: "csv",
    status: "committed",
    columns: ["name"],
    mapping: [{ sourceField: "name", targetField: "name" }],
    rowCount: committedCount,
    byteLength: 10,
    createdAt: committedAt,
    createdBy: tenantId,
    updatedAt: committedAt,
    updatedBy: tenantId,
    committedAt,
    committedBy: tenantId,
    committedCount,
    skippedCount: 0,
  });
  all[tenantId] = arr;
  writeJSON(path, all);
}

async function stageJob(tenantId: string, rows: string) {
  seedTable(tenantId);
  const created : any = await submitFileImportWrite(dataDir, tenantId, "createFileImport", {
    name: "Clients import",
    target: { kind: "table", tableId: TABLE_ID },
  }, tenantId);
  expect(created.applied).toBe(true);
  const id = created.id as string;
  const up : any = await submitFileImportWrite(dataDir, tenantId, "uploadFileImport", {
    jobId: id,
    format: "csv",
    content: rows,
  }, tenantId);
  expect(up.applied).toBe(true);
  const mapped : any = await submitFileImportWrite(dataDir, tenantId, "mapFileImportFields", {
    jobId: id,
    mapping: [{ sourceField: "name", targetField: "name" }, { sourceField: "email", targetField: "email" }],
  }, tenantId);
  expect(mapped.applied).toBe(true);
  return id;
}

const TWO_ROWS = "name,email\nAlpha,alpha@example.test\nBeta,beta@example.test\n";

/* ───────────────────────────── the numbers ────────────────────────────── */

describe("approved tier contents (owner 2026-10-30)", () => {
  it("carries exactly the three prices and the approved limits", () => {
    expect(TIER_SPECS.starter.monthlyUsd).toBe(199);
    expect(TIER_SPECS.growth.monthlyUsd).toBe(599);
    expect(TIER_SPECS.enterprise.monthlyUsd).toBe(1499);
    expect(TIER_SPECS.starter.limits.importRowsPerMonth).toBe(10000);
    expect(TIER_SPECS.growth.limits.importRowsPerMonth).toBe(100000);
    expect(TIER_SPECS.enterprise.limits.importRowsPerMonth).toBeNull(); // custom volume
    expect(TIER_SPECS.starter.limits.seats).toBe(3);
    expect(TIER_SPECS.growth.limits.seats).toBe(15);
    expect(TIER_SPECS.enterprise.limits.seats).toBeNull();
    expect(TIER_SPECS.starter.limits.auditRetentionDays).toBe(90);
    expect(TIER_SPECS.growth.limits.auditRetentionDays).toBe(365);
    expect(TIER_SPECS.starter.limits.auditExport).toBe(false);
    expect(TIER_SPECS.growth.limits.auditExport).toBe(true);
    expect(TIER_SPECS.growth.limits.apiAdapters).toBe(3);
    expect(TIER_SPECS.enterprise.limits.apiAdapters).toBeNull();
    expect(TIER_SPECS.starter.features.apiAdapters).toBe(false);
    expect(TIER_SPECS.starter.features.controlPlane).toBe(false);
    expect(TIER_SPECS.growth.features.controlPlane).toBe(true);
    expect(TIER_SPECS.enterprise.features.sso).toBe(true);
    expect(TIER_SPECS.growth.features.sso).toBe(false);
  });

  it("never gates the core job: quote-to-cash, free primitives and approvals are in every tier", () => {
    for (const tier of ["starter", "growth", "enterprise"] as const) {
      expect(TIER_SPECS[tier].features.quoteToCash).toBe(true);
      expect(TIER_SPECS[tier].features.freePrimitives).toBe(true);
      expect(TIER_SPECS[tier].features.approvalsQueue).toBe(true);
    }
  });
});

/* ─────────────────────────── tier resolution ──────────────────────────── */

describe("resolveEntitlement — facts over guesses", () => {
  it("reads the tier from the purchase row the Stripe webhook wrote", () => {
    const ent = resolveEntitlement({
      email: GROWTH,
      purchases: { [GROWTH]: [{ type: "plan", tier: "growth", productName: "Growth Plan", amount: 59900, status: "active" }] },
      subscriptions: {},
    });
    expect(ent.tier).toBe("growth");
    expect(ent.tierSource).toBe("purchase_tier");
    expect(ent.enforce).toBe(true);
    expect(ent.uncertain).toBe(false);
  });

  it("the SUBSCRIPTION record governs state, the PURCHASE row governs tier", () => {
    const ent = resolveEntitlement({
      email: STARTER,
      purchases: { [STARTER]: [{ type: "plan", tier: "starter", amount: 19900, status: "active" }] },
      subscriptions: { [STARTER]: { status: "canceled", access: "revoked" } },
    });
    expect(ent.tier).toBe("starter");
    expect(ent.access).toBe("revoked");
  });

  it("a past_due subscription is at_risk, never revoked (a card retry is not a cut-off)", () => {
    const ent = resolveEntitlement({
      email: STARTER,
      purchases: { [STARTER]: [{ type: "plan", tier: "starter", amount: 19900 }] },
      subscriptions: { [STARTER]: { status: "past_due", access: "at_risk" } },
    });
    expect(ent.access).toBe("at_risk");
    expect(ent.enforce).toBe(true);
  });

  it("the recorded tier always wins over the amount, even when they disagree", () => {
    // The amount says Enterprise; the row the webhook wrote says Starter.
    // The record wins — the amount path is a last resort, never an override.
    const ent = resolveEntitlement({
      email: STARTER,
      purchases: { [STARTER]: [{ type: "plan", tier: "starter", amount: 149900, status: "active" }] },
    });
    expect(ent.tier).toBe("starter");
    expect(ent.tierSource).toBe("purchase_tier");
    expect(ent.uncertain).toBe(false);
  });
  it("an unreadable tier falls back to the amount actually paid", () => {
    const ent = resolveEntitlement({
      email: ENTERPRISE,
      purchases: { [ENTERPRISE]: [{ type: "plan", tier: "legacy-enterprise", amount: 149900 }] },
    });
    expect(ent.tier).toBe("enterprise");
    expect(ent.tierSource).toBe("purchase_amount");
    expect(ent.uncertain).toBe(true);
  });

  it("a plan we cannot read at all lands on the conservative paid tier, never on Enterprise", () => {
    const ent = resolveEntitlement({
      email: "mystery@example.test",
      purchases: { "mystery@example.test": [{ type: "plan", tier: "???", amount: 17 }] },
    });
    expect(ent.tier).toBe("starter");
    expect(ent.uncertain).toBe(true);
    expect(ent.limits.importRowsPerMonth).toBe(10000);
  });

  it("no purchase on record is not a paid tier and nothing is enforced", () => {
    const ent = resolveEntitlement({ email: NO_PLAN, purchases: {}, subscriptions: {} });
    expect(ent.tier).toBe("none");
    expect(ent.enforce).toBe(false);
    expect(ent.features.freePrimitives).toBe(true);
    expect(ent.features.quoteToCash).toBe(true);
    expect(ent.limits.importRowsPerMonth).toBeNull();
  });

  it("the platform owner is not a customer: full capability, sourced as owner", () => {
    const ent = resolveEntitlement({ email: "owner@example.test", purchases: {}, owner: true });
    expect(ent.tier).toBe("enterprise");
    expect(ent.tierSource).toBe("owner");
  });

  it("normalizes stored tier spellings and refuses to invent one", () => {
    expect(normalizeTier("Starter")).toBe("starter");
    expect(normalizeTier("growth plan")).toBe("growth");
    expect(normalizeTier("pro")).toBeNull();
    expect(normalizeTier(undefined)).toBeNull();
    expect(tierFromAmountCents(59900)).toBe("growth");
    expect(tierFromAmountCents(149900)).toBe("enterprise");
    // A setup-era total (monthly + a one-time fee) is AMBIGUOUS: $699.00 could
    // be Starter plus a one-time setup fee or Growth alone, and the number cannot tell us
    // which. Ambiguity ROUNDS DOWN, never up — we never hand out a tier above
    // what the money proves. (The purchase row's `tier` field, written by the
    // signature-verified webhook, always wins over this inference anyway.)
    expect(tierFromAmountCents(19900 + 50000)).toBe("starter");
    expect(tierFromAmountCents(19900)).toBe("starter");
    // Slightly above a rung still proves that rung (tax / rounding).
    expect(tierFromAmountCents(19900 + 500)).toBe("starter");
    // Below a rung's price never rounds up to it: $1,399 is not Enterprise.
    expect(tierFromAmountCents(149900 - 10000)).toBe("starter");
    // A big overpay proves nothing above the entry rung either.
    expect(tierFromAmountCents(59900 + 50000)).toBe("starter");
    expect(tierFromAmountCents(12)).toBeNull();
  });
});

/* ──────────────────────────── import volume ───────────────────────────── */

describe("import volume — the one quota that existed is now a tier limit", () => {
  it("refuses Starter past 10,000 rows a month and names the tier and the limit", () => {
    const ent = resolveEntitlement({ email: STARTER, purchases: { [STARTER]: [{ type: "plan", tier: "starter", amount: 19900 }] } });
    const ok = checkImportQuota(ent, 9800, 200);
    expect(ok.allowed).toBe(true);
    expect(ok.limit).toBe(10000);
    const denied = checkImportQuota(ent, 9950, 200);
    expect(denied.allowed).toBe(false);
    expect(denied.message).toContain("Starter");
    expect(denied.message).toContain("10,000");
    expect(denied.message).toContain("9,950");
    expect(denied.message).toContain("Nothing was written");
    expect(denied.upgradeTo).toBe("growth");
  });

  it("gives Growth 100,000 and points past it to Enterprise", () => {
    const ent = resolveEntitlement({ email: GROWTH, purchases: { [GROWTH]: [{ type: "plan", tier: "growth", amount: 59900 }] } });
    expect(checkImportQuota(ent, 99000, 500).allowed).toBe(true);
    const denied = checkImportQuota(ent, 99900, 500);
    expect(denied.allowed).toBe(false);
    expect(denied.message).toContain("100,000");
    expect(denied.upgradeTo).toBe("enterprise");
  });

  it("Enterprise custom volume never refuses", () => {
    const ent = resolveEntitlement({ email: ENTERPRISE, purchases: { [ENTERPRISE]: [{ type: "plan", tier: "enterprise", amount: 149900 }] } });
    const res = checkImportQuota(ent, 5_000_000, 10_000);
    expect(res.allowed).toBe(true);
    expect(res.limit).toBeNull();
  });

  it("counts only rows actually written this calendar month, across both import lanes", () => {
    const month = currentMonthKey();
    const otherMonth = "2020-01-01T00:00:00.000Z";
    const used = countImportRowsInMonth({
      fileJobs: [
        { status: "committed", committedAt: `${month}-05T10:00:00.000Z`, committedCount: 120 },
        { status: "committed", committedAt: `${month}-06T10:00:00.000Z`, committedCount: 30 },
        { status: "committed", committedAt: otherMonth, committedCount: 9999 },
        { status: "uploaded", committedAt: `${month}-07T10:00:00.000Z`, committedCount: 500 },
      ],
      importRuns: [
        { op: "commitImport", at: `${month}-08T10:00:00.000Z`, committed: 40 },
        { op: "commitImport", at: otherMonth, committed: 7000 },
        { op: "pullImportData", at: `${month}-09T10:00:00.000Z`, committed: 900 },
        { op: "commitImport", at: `${month}-10T10:00:00.000Z`, committed: 0, failed: 1 },
      ],
    }, month);
    expect(used).toBe(190);
    expect(monthKeyOf(`${month}-01T00:00:00.000Z`)).toBe(month);
    expect(monthKeyOf("nonsense")).toBe("");
  });
});

/* ───────────────────────────── feature gates ──────────────────────────── */

describe("checkFeature — control plane and adapters", () => {
  const starter = resolveEntitlement({ email: STARTER, purchases: { [STARTER]: [{ type: "plan", tier: "starter", amount: 19900 }] } });
  const growth = resolveEntitlement({ email: GROWTH, purchases: { [GROWTH]: [{ type: "plan", tier: "growth", amount: 59900 }] } });
  const enterprise = resolveEntitlement({ email: ENTERPRISE, purchases: { [ENTERPRISE]: [{ type: "plan", tier: "enterprise", amount: 149900 }] } });

  it("control plane is Growth+ and names the upgrade", () => {
    const denied = checkFeature(starter, "controlPlane");
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.upgradeTo).toBe("growth");
      expect(denied.reason).toContain("Growth");
    }
    expect(checkFeature(growth, "controlPlane").allowed).toBe(true);
    expect(checkFeature(enterprise, "controlPlane").allowed).toBe(true);
  });

  it("the core chain, the free primitives and the approvals queue are never denied", () => {
    for (const ent of [starter, growth, enterprise]) {
      expect(checkFeature(ent, "quoteToCash").allowed).toBe(true);
      expect(checkFeature(ent, "freePrimitives").allowed).toBe(true);
      expect(checkFeature(ent, "approvalsQueue").allowed).toBe(true);
    }
  });

  it("SSO is Enterprise, adapters are Growth+", () => {
    expect(checkFeature(growth, "sso").allowed).toBe(false);
    expect(checkFeature(enterprise, "sso").allowed).toBe(true);
    expect(checkFeature(starter, "apiAdapters").allowed).toBe(false);
    expect(checkFeature(growth, "apiAdapters").allowed).toBe(true);
  });

  it("an unknown feature is denied rather than silently allowed", () => {
    const res = checkFeature(starter, "notAFeature" as never);
    expect(res.allowed).toBe(false);
  });
});

/* ───────────────────────── the store-backed gate ──────────────────────── */

describe("loadEntitlement / requireFeature — the server-side gate over real stores", () => {
  it("resolves from the durable stores and enforces only a proven tier", () => {
    seedPurchases({
      [STARTER]: [{ type: "plan", tier: "starter", amount: 19900, status: "active" }],
      [GROWTH]: [{ type: "plan", tier: "growth", amount: 59900, status: "active" }],
    });
    expect(loadEntitlement(STARTER, dataDir).tier).toBe("starter");
    expect(loadEntitlement(GROWTH, dataDir).tier).toBe("growth");
    expect(loadEntitlement(NO_PLAN, dataDir).tier).toBe("none");
    expect(requireFeature(STARTER, "controlPlane", dataDir).allowed).toBe(false);
    expect(requireFeature(GROWTH, "controlPlane", dataDir).allowed).toBe(true);
    // No plan on record → nothing to enforce (never a lockout).
    expect(requireFeature(NO_PLAN, "controlPlane", dataDir).allowed).toBe(true);
  });

  it("counts a tenant's month from the durable job records", () => {
    seedPurchases({ [STARTER]: [{ type: "plan", tier: "starter", amount: 19900 }] });
    seedCommittedJob(STARTER, 400);
    seedCommittedJob(STARTER, 600);
    expect(importRowsUsedThisMonth(STARTER, dataDir)).toBe(1000);
    expect(importRowsUsedThisMonth(GROWTH, dataDir)).toBe(0); // isolation
    const decision = checkImportAllowed(STARTER, 9000, dataDir);
    expect(decision.quota.allowed).toBe(true);
    expect(decision.quota.remaining).toBe(9000);
  });

  it("keeps tenants isolated: another tenant's imports never consume your quota", () => {
    seedPurchases({ [STARTER]: [{ type: "plan", tier: "starter", amount: 19900 }] });
    seedCommittedJob(GROWTH, 999999);
    expect(importRowsUsedThisMonth(STARTER, dataDir)).toBe(0);
  });
});

/* ───────────────── the enforcement, end to end ────────────────────────── */

describe("file import commit — the gate actually refuses over-quota imports", () => {
  it("refuses the commit that would cross the Starter line, and writes nothing", async () => {
    seedPurchases({ [STARTER]: [{ type: "plan", tier: "starter", amount: 19900, status: "active" }] });
    seedCommittedJob(STARTER, 9999); // 9,999 used this month; this file adds 2
    const id = await stageJob(STARTER, TWO_ROWS);
    const res : any = await submitFileImportWrite(dataDir, STARTER, "commitFileImport", { jobId: id }, STARTER);
    expect(res.applied).toBe(false);
    expect(res.pending).toBe(false);
    expect(res.error).toContain("Starter");
    expect(res.error).toContain("10,000");
    // Nothing was written and the job is still committable state, not committed.
    expect(listRows(dataDir, STARTER, TABLE_ID)).toHaveLength(0);
    expect(getJob(dataDir, STARTER, id)?.status).not.toBe("committed");
  });

  it("the same import succeeds inside the limit", async () => {
    seedPurchases({ [STARTER]: [{ type: "plan", tier: "starter", amount: 19900, status: "active" }] });
    seedCommittedJob(STARTER, 100);
    const id = await stageJob(STARTER, TWO_ROWS);
    const res : any = await submitFileImportWrite(dataDir, STARTER, "commitFileImport", { jobId: id }, STARTER);
    expect(res.error ?? "").not.toContain("Import refused");
    // Approval queue is ON by default → the commit queues rather than writes.
    expect(res.pending).toBe(true);
    expect(getJob(dataDir, STARTER, id)?.status).not.toBe("committed");
  });

  it("Growth with the same usage is not refused", async () => {
    seedPurchases({ [GROWTH]: [{ type: "plan", tier: "growth", amount: 59900, status: "active" }] });
    seedCommittedJob(GROWTH, 9990);
    const id = await stageJob(GROWTH, TWO_ROWS);
    const res : any = await submitFileImportWrite(dataDir, GROWTH, "commitFileImport", { jobId: id }, GROWTH);
    expect(res.error ?? "").not.toContain("Import refused");
  });

  it("executeCommit re-checks the quota, so a queued approval cannot bypass it", async () => {
    seedPurchases({ [STARTER]: [{ type: "plan", tier: "starter", amount: 19900, status: "active" }] });
    seedCommittedJob(STARTER, 9990);
    const id = await stageJob(STARTER, TWO_ROWS);
    seedCommittedJob(STARTER, 50); // usage rose after the job was staged
    const out = executeCommit(dataDir, STARTER, id, STARTER);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("10,000");
    expect(listRows(dataDir, STARTER, TABLE_ID)).toHaveLength(0);
  });

  it("a tenant with no plan is not blocked by an invented limit", async () => {
    const id = await stageJob(NO_PLAN, TWO_ROWS);
    const res : any = await submitFileImportWrite(dataDir, NO_PLAN, "commitFileImport", { jobId: id }, NO_PLAN);
    expect(res.error ?? "").not.toContain("Import refused");
  });
});

/* ───────────────────────────── presentation ───────────────────────────── */

describe("describeEntitlement — the page and the gate agree", () => {
  it("labels the import row enforced and marks the unenforced contents as stated", () => {
    const ent = resolveEntitlement({ email: STARTER, purchases: { [STARTER]: [{ type: "plan", tier: "starter", amount: 19900 }] } });
    const { rows, notes } = describeEntitlement(ent);
    const byLabel = (l: string) => rows.find((r) => r.label === l);
    expect(byLabel("Plan")?.value).toContain("Starter");
    expect(byLabel("Imported rows per month")).toEqual({ label: "Imported rows per month", value: "10,000 rows/month", status: "enforced" });
    expect(byLabel("Seats")?.status).toBe("stated"); // approved content, not gated yet
    expect(byLabel("Automation control plane")?.status).toBe("enforced");
    expect(byLabel("Provider API adapters")?.status).toBe("not-built");
    expect(notes.join(" ")).toContain("quote-to-cash");
    expect(tierSummary(ent)).toContain("10,000 imported rows/month");
  });

  it("says plainly when there is no plan", () => {
    const ent = resolveEntitlement({ email: NO_PLAN });
    const { rows } = describeEntitlement(ent);
    expect(rows[0].value).toBe("No plan on file");
  });
});

/* ─────────────────────── wiring guards (the gates call it) ────────────── */

const SRC = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf-8");
}

describe("wiring — every stated limit is enforced somewhere real", () => {
  it("the file-import gate refuses at BOTH the submit and the apply funnel", () => {
    const gate = read("native/fileimport/gate.ts");
    expect(gate).toContain('import { checkImportAllowed } from "../../lib/entitlement-store"');
    expect(gate).toContain("checkImportAllowed(tenantId, preview.records.length, dataDir)");
    expect(gate).toContain("checkImportAllowed(tenantId, validation.records.length, dataDir)");
  });

  it("the provider import gate refuses at submit and at apply", () => {
    const gate = read("native/import/gate.ts");
    expect(gate).toContain('import { checkImportAllowed } from "../../lib/entitlement-store"');
    expect(gate).toContain("checkImportAllowed(tenantId, importRows.length, dataDir)");
    expect(gate).toContain("checkImportAllowed(tenantId, applyRows, dataDir)");
  });

  it("the control plane is refused at autonomy enablement", () => {
    const autonomy = read("lib/autonomy.ts");
    expect(autonomy).toContain('import { requireFeature } from "./entitlement-store"');
    expect(autonomy).toContain('requireFeature(tenantId, "controlPlane", dataDir)');
  });

  it("the server gates approvals auto-mode and serves the entitlement read", () => {
    const server = readFileSync(join(SRC, "..", "prod-server.ts"), "utf-8");
    expect(server).toContain('requireFeature(user.email, "controlPlane", DATA_DIR)');
    expect(server).toContain('if (pathname === "/api/native/entitlements")');
    expect(server).toContain("loadEntitlement(user.email, DATA_DIR)");
  });

  it("the portal billing page renders from the same helper and drops the old claim", () => {
    const page = read("lazy/portal.billing.index.page.tsx");
    expect(page).toContain('fetch("/api/native/entitlements"');
    expect(page).toContain("Your plan and limits");
    expect(page).not.toContain("every plan includes all platform capabilities");
  });

  it("the pricing page takes its numbers from TIER_SPECS instead of hardcoding them", () => {
    const pricing = read("routes/pricing.tsx");
    expect(pricing).toContain('import { TIER_SPECS, type PaidTier } from "~/lib/entitlements"');
    expect(pricing).toContain("limitLines(tier.name.toLowerCase() as PaidTier)");
    expect(pricing).not.toContain("10,000 imported rows");
    expect(pricing).not.toContain("per-workflow autonomy allow-lists");
  });

  it("the automations page shows the honest 'included from Growth' state", () => {
    const page = read("lazy/portal.automations.index.page.tsx");
    expect(page).toContain('fetch("/api/native/entitlements"');
    expect(page).toContain("included from Growth");
    expect(page).toContain("disabled={!controlPlane}");
  });
});
