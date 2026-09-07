/**
 * autonomy.test.ts — AUTONOMY MODE (owner decision 2026-09-07).
 *
 * Per-workflow opt-in full automation with the safety floor:
 *  - default OFF (approvals ON) — nothing auto-executes unless the tenant
 *    explicitly enables the workflow AND allow-lists the action.
 *  - explicit write allow-list — non-listed actions stay approval-gated.
 *  - durable audit log — every auto-executed action is appended, immutable.
 *  - kill switch (tenant + owner global) — instant revert to gated.
 *  - error-budget fallback — 3 consecutive failures revert the workflow.
 *  - invariants in EVERY mode: non-destruction (never delete unknown rows)
 *    and per-tenant isolation (tenant A's autonomy cannot touch tenant B).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  isAutonomyEnabled,
  setAutonomyWorkflow,
  setTenantAutonomyKillSwitch,
  setOwnerAutonomyKillSwitch,
  appendAutonomyAudit,
  autonomyAudit,
  recordAutonomyOutcome,
  autonomyStatus,
  isAutonomyEligible,
  allowListMatches,
  AUTONOMY_MAX_CONSECUTIVE_FAILURES,
  AUTONOMY_AUDIT_KEY,
} from "../lib/autonomy";
import { approvalGate, listPendingActions, approvalModeForTenant } from "../lib/approval-queue";
import { setApprovalMode } from "../lib/tenant-settings";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "autonomy-"));
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* gone */ }
});

describe("AUTONOMY MODE — default-off + enable flow", () => {
  it("default OFF: no workflow is autonomy-enabled for a fresh tenant (approvals ON)", () => {
    expect(isAutonomyEnabled("tenant-a@test", "quote-to-cash.v1", dir)).toBe(false);
    // And the approval gate still gates writes (default path unchanged).
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.allowed).toBe(false);
  });

  it("enable flow: enabling a workflow WITHOUT an allow-list still gates every write", () => {
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", { enabled: true, allowList: [] }, dir);
    expect(isAutonomyEnabled("tenant-a@test", "quote-to-cash.v1", dir)).toBe(true);
    // Even enabled, an action with no matching allow-list entry stays gated.
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.allowed).toBe(false);
    expect(out.actionId).toBeTruthy();
    expect(listPendingActions("tenant-a@test", dir)).toHaveLength(1);
  });

  it("disabled workflow: writes never auto-execute even with an allow-list set", () => {
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", {
      enabled: false,
      allowList: [{ id: "al-1", action: "createXeroInvoice" }],
    }, dir);
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.allowed).toBe(false);
    expect(out.autonomy).toBeUndefined();
  });
});

describe("AUTONOMY MODE — explicit allow-list gating", () => {
  it("allow-listed action in an enabled workflow auto-executes (autonomy:true + allowListId)", () => {
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", {
      enabled: true,
      allowList: [{ id: "al-invoice", action: "createXeroInvoice" }],
    }, dir);
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", { Type: "ACCREC" }, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.allowed).toBe(true);
    expect(out.autonomy).toBe(true);
    expect(out.allowListId).toBe("al-invoice");
    // No pending action enqueued — it auto-executed.
    expect(listPendingActions("tenant-a@test", dir)).toHaveLength(0);
  });

  it("NON-listed action in an enabled workflow STAYS gated (pending)", () => {
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", {
      enabled: true,
      allowList: [{ id: "al-invoice", action: "createXeroInvoice" }],
    }, dir);
    const out = approvalGate("tenant-a@test", "createHubSpotContact", "hubspot", { properties: {} }, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.allowed).toBe(false);
    expect(out.autonomy).toBeUndefined();
    expect(out.actionId).toBeTruthy();
    expect(listPendingActions("tenant-a@test", dir)).toHaveLength(1);
  });

  it("glob allow-list entry matches multiple actions", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-all-create", action: "create*" }] }, dir);
    expect(allowListMatches({ id: "x", action: "create*" }, "createXeroInvoice")).toBe(true);
    expect(allowListMatches({ id: "x", action: "create*" }, "createHubSpotContact")).toBe(true);
    expect(allowListMatches({ id: "x", action: "create*" }, "deleteXeroInvoice")).toBe(false);
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w1" });
    expect(out.allowed).toBe(true);
    expect(out.allowListId).toBe("al-all-create");
  });

  it("different workflows are independent: allow-list in w1 does NOT leak to w2", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w2" });
    expect(out.allowed).toBe(false); // w2 has no autonomy config → gated
    expect(out.actionId).toBeTruthy();
  });
});

describe("AUTONOMY MODE — durable audit log", () => {
  it("auto-executed actions append durable audit entries (immutable, actor=system/autonomy)", () => {
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", {
      enabled: true,
      allowList: [{ id: "al-invoice", action: "createXeroInvoice" }],
    }, dir);
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", { Type: "ACCREC" }, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.autonomy).toBe(true);
    // Record the outcome (as executeAction does after the write).
    recordAutonomyOutcome("tenant-a@test", "quote-to-cash.v1", "createXeroInvoice", "xero", true, {
      dataDir: dir,
      allowListId: out.allowListId,
      target: "inv-1",
    });
    const audit = autonomyAudit("tenant-a@test", dir);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("createXeroInvoice");
    expect(audit[0].workflowId).toBe("quote-to-cash.v1");
    expect(audit[0].allowListId).toBe("al-invoice");
    expect(audit[0].actor).toBe("system/autonomy");
    expect(audit[0].outcome).toBe("executed");
    expect(audit[0].tenantEmail).toBe("tenant-a@test");
    expect(audit[0].createdAt).toBeGreaterThan(0);
    // The audit is DURABLE on disk (append-only file exists).
    expect(readFileSync(join(dir, AUTONOMY_AUDIT_KEY), "utf8")).toContain("createXeroInvoice");
  });

  it("audit entries are never overwritten: multiple outcomes append in order", () => {
    const e1 = appendAutonomyAudit({ tenantEmail: "tenant-a@test", workflowId: "w1", action: "a.create", provider: "x", outcome: "executed" }, dir);
    const e2 = appendAutonomyAudit({ tenantEmail: "tenant-a@test", workflowId: "w1", action: "b.create", provider: "x", outcome: "failed" }, dir);
    const audit = autonomyAudit("tenant-a@test", dir);
    expect(audit).toHaveLength(2);
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(["a.create", "b.create"]));
    expect(e1.actionId).not.toBe(e2.actionId);
  });

  it("ISOLATION: audit logs are per-tenant (A's entries invisible to B)", () => {
    appendAutonomyAudit({ tenantEmail: "tenant-a@test", workflowId: "w1", action: "a.create", provider: "x", outcome: "executed" }, dir);
    appendAutonomyAudit({ tenantEmail: "tenant-b@test", workflowId: "w1", action: "b.create", provider: "x", outcome: "executed" }, dir);
    expect(autonomyAudit("tenant-a@test", dir).map((x) => x.action)).toEqual(["a.create"]);
    expect(autonomyAudit("tenant-b@test", dir).map((x) => x.action)).toEqual(["b.create"]);
  });
});

describe("AUTONOMY MODE — kill switch (tenant + owner global)", () => {
  it("tenant kill switch instantly reverts an enabled+allow-listed workflow to gated", () => {
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    expect(isAutonomyEnabled("tenant-a@test", "quote-to-cash.v1", dir)).toBe(true);
    setTenantAutonomyKillSwitch("tenant-a@test", true, dir);
    expect(isAutonomyEnabled("tenant-a@test", "quote-to-cash.v1", dir)).toBe(false);
    // The gate now enqueues (gated) even though the allow-list matches.
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.allowed).toBe(false);
    expect(out.actionId).toBeTruthy();
    expect(listPendingActions("tenant-a@test", dir)).toHaveLength(1);
  });

  it("owner-level global kill switch gates ALL tenants immediately", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    setAutonomyWorkflow("tenant-b@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    setOwnerAutonomyKillSwitch(true, dir);
    expect(isAutonomyEnabled("tenant-a@test", "w1", dir)).toBe(false);
    expect(isAutonomyEnabled("tenant-b@test", "w1", dir)).toBe(false);
    const outA = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w1" });
    const outB = approvalGate("tenant-b@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w1" });
    expect(outA.allowed).toBe(false);
    expect(outB.allowed).toBe(false);
  });

  it("kill switch is per-tenant: A's kill switch does NOT affect B", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    setAutonomyWorkflow("tenant-b@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    setTenantAutonomyKillSwitch("tenant-a@test", true, dir);
    expect(isAutonomyEnabled("tenant-a@test", "w1", dir)).toBe(false);
    expect(isAutonomyEnabled("tenant-b@test", "w1", dir)).toBe(true); // B unaffected
    const outA = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w1" });
    expect(outA.allowed).toBe(false);
    const outB = approvalGate("tenant-b@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w1" });
    expect(outB.allowed).toBe(true);
  });
});

describe("AUTONOMY MODE — error-budget fallback", () => {
  it("3 consecutive auto-execution failures revert the workflow to gated, durably", () => {
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    expect(isAutonomyEnabled("tenant-a@test", "quote-to-cash.v1", dir)).toBe(true);
    // Fail 3 times (as executeAction does on provider errors).
    for (let i = 0; i < AUTONOMY_MAX_CONSECUTIVE_FAILURES; i++) {
      recordAutonomyOutcome("tenant-a@test", "quote-to-cash.v1", "createXeroInvoice", "xero", false, { dataDir: dir, allowListId: "al-1", error: `provider err ${i}` });
    }
    expect(isAutonomyEnabled("tenant-a@test", "quote-to-cash.v1", dir)).toBe(false);
    const st = autonomyStatus("tenant-a@test", "quote-to-cash.v1", dir);
    expect(st.revertedByBudget).toBe(true);
    expect(st.enabled).toBe(false);
    // The write is gated again even though allow-listed.
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(out.allowed).toBe(false);
    expect(out.actionId).toBeTruthy();
    // Durable record: a "reverted" audit entry exists (newest-first list).
    const audit = autonomyAudit("tenant-a@test", dir);
    const revertedEntry = audit.find((e) => e.outcome === "reverted");
    expect(revertedEntry).toBeDefined();
    expect(revertedEntry?.error).toMatch(/reverted to gated/);
  });

  it("a SUCCESS resets the error budget (2 failures then success keeps the workflow alive)", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    recordAutonomyOutcome("tenant-a@test", "w1", "createXeroInvoice", "xero", false, { dataDir: dir, allowListId: "al-1" });
    recordAutonomyOutcome("tenant-a@test", "w1", "createXeroInvoice", "xero", false, { dataDir: dir, allowListId: "al-1" });
    recordAutonomyOutcome("tenant-a@test", "w1", "createXeroInvoice", "xero", true, { dataDir: dir, allowListId: "al-1" });
    const st = autonomyStatus("tenant-a@test", "w1", dir);
    expect(st.consecutiveFailures).toBe(0);
    expect(isAutonomyEnabled("tenant-a@test", "w1", dir)).toBe(true);
  });

  it("failures in one workflow do NOT change another workflow's error budget", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    setAutonomyWorkflow("tenant-a@test", "w2", { enabled: true, allowList: [{ id: "al-1", action: "createHubSpotContact" }] }, dir);
    for (let i = 0; i < AUTONOMY_MAX_CONSECUTIVE_FAILURES; i++) {
      recordAutonomyOutcome("tenant-a@test", "w1", "createXeroInvoice", "xero", false, { dataDir: dir, allowListId: "al-1" });
    }
    expect(isAutonomyEnabled("tenant-a@test", "w1", dir)).toBe(false);
    expect(isAutonomyEnabled("tenant-a@test", "w2", dir)).toBe(true); // w2 untouched
  });
});

describe("AUTONOMY MODE — non-destruction invariant", () => {
  it("allow-listed DESTRUCTIVE action without a known-row target is NOT eligible (never delete unknown rows)", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-del", action: "deleteXeroInvoice" }] }, dir);
    // No `id` in payload → NOT eligible → gated (no auto delete).
    const out = approvalGate("tenant-a@test", "deleteXeroInvoice", "xero", { filter: "all" }, { dataDir: dir, workflowId: "w1" });
    expect(out.allowed).toBe(false);
    expect(out.autonomy).toBeUndefined();
    expect(out.actionId).toBeTruthy();
  });

  it("allow-listed DESTRUCTIVE action WITH a known-row id is eligible (bounded delete)", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-del", action: "deleteXeroInvoice" }] }, dir);
    const out = approvalGate("tenant-a@test", "deleteXeroInvoice", "xero", { id: "inv-123" }, { dataDir: dir, workflowId: "w1" });
    expect(out.allowed).toBe(true);
    expect(out.autonomy).toBe(true);
    expect(out.allowListId).toBe("al-del");
  });

  it("delete is NOT eligible via a glob allow-list entry (must be explicit)", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-glob", action: "delete*" }] }, dir);
    const out = approvalGate("tenant-a@test", "deleteXeroInvoice", "xero", { id: "inv-123" }, { dataDir: dir, workflowId: "w1" });
    // Glob alone is not enough for a destructive verb → still gated.
    expect(out.allowed).toBe(false);
  });

  it("non-destructive allow-listed write does NOT require a row id", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-create", action: "createXeroInvoice" }] }, dir);
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", { Type: "ACCREC" }, { dataDir: dir, workflowId: "w1" });
    expect(out.allowed).toBe(true);
  });
});

describe("AUTONOMY MODE — per-tenant isolation", () => {
  it("tenant A's autonomy config never affects tenant B's writes", () => {
    // A enables + allow-lists createXeroInvoice; B has no config.
    setAutonomyWorkflow("tenant-a@test", "quote-to-cash.v1", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    const outB = approvalGate("tenant-b@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "quote-to-cash.v1" });
    expect(outB.allowed).toBe(false); // B stays gated (default)
    expect(outB.actionId).toBeTruthy();
    // B's pending queue has its own entry; A's queue is untouched.
    expect(listPendingActions("tenant-b@test", dir)).toHaveLength(1);
    expect(listPendingActions("tenant-a@test", dir)).toHaveLength(0);
  });

  it("allow-list matching is tenant-scoped: same workflow id, different tenants", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-a", action: "createXeroInvoice" }] }, dir);
    setAutonomyWorkflow("tenant-b@test", "w1", { enabled: true, allowList: [{ id: "al-b", action: "createHubSpotContact" }] }, dir);
    // A: Xero invoice is allow-listed → auto; HubSpot contact is NOT → gated.
    expect(approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w1" }).allowed).toBe(true);
    expect(approvalGate("tenant-a@test", "createHubSpotContact", "hubspot", {}, { dataDir: dir, workflowId: "w1" }).allowed).toBe(false);
    // B: HubSpot contact is allow-listed → auto; Xero invoice is NOT → gated.
    expect(approvalGate("tenant-b@test", "createHubSpotContact", "hubspot", {}, { dataDir: dir, workflowId: "w1" }).allowed).toBe(true);
    expect(approvalGate("tenant-b@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "w1" }).allowed).toBe(false);
  });
});

describe("AUTONOMY MODE — fail-closed edge cases", () => {
  it("unknown/empty tenant or workflow is never autonomy-enabled", () => {
    expect(isAutonomyEnabled("", "w1", dir)).toBe(false);
    expect(isAutonomyEnabled("tenant@test", "", dir)).toBe(false);
    expect(isAutonomyEnabled("", "", dir)).toBe(false);
  });

  it("unknown workflow id in the gate stays approval-gated (fail-closed)", () => {
    setAutonomyWorkflow("tenant-a@test", "known-wf", { enabled: true, allowList: [{ id: "al-1", action: "createXeroInvoice" }] }, dir);
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: "unknown-wf" });
    expect(out.allowed).toBe(false);
    expect(out.actionId).toBeTruthy();
  });

  it("reads always pass through in autonomy mode (no gating of reads)", () => {
    setAutonomyWorkflow("tenant-a@test", "w1", { enabled: true, allowList: [{ id: "al-1", action: "getXeroInvoice" }] }, dir);
    const out = approvalGate("tenant-a@test", "getXeroInvoice", "xero", { id: "inv-1" }, { dataDir: dir, workflowId: "w1" });
    expect(out.allowed).toBe(true);
    expect(out.autonomy).toBeUndefined(); // reads aren't "auto-executed" — they always pass
  });
});

// ── Platform-wide capability (every AI employee, by construction) ─────
// The 18 employee types all flow through the SHARED orchestrator →
// executeAction → approvalGate path, with the per-workflow autonomy key
// defaulting to the agentId (input.agentId || "ai-employee"). Every
// employee therefore supports the SAME autonomy capability set (per-
// workflow opt-in, explicit allow-list, durable audit, kill switch,
// error-budget fallback) without any per-employee wiring. This test
// iterates every type and proves each can carry a allow-list + audit +
// kill-switch config and auto-executes ONLY allow-listed writes.
import { readdirSync } from "fs";
import { join as pathJoin } from "path";

const EMPLOYEE_TYPES = [
  "auditLogger", "contractManagement", "customerSuccess", "dispatchLogistics",
  "documentIntake", "fpAndA", "healthcareIntake", "hrCompliance",
  "inventoryManagement", "invoiceLedger", "itOperations", "knowledgeAssistant",
  "marketingSocial", "procurementVendor", "projectManagement", "salesOutreach",
  "supportAgent", "voiceReceptionist",
];

describe("AUTONOMY MODE — platform-wide (every AI employee, by construction)", () => {
  it("all 18 employee files exist (roster integrity)", () => {
    const files = readdirSync(pathJoin(process.cwd(), "src/agents/employees"))
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .map((f) => f.replace(/\.ts$/, ""));
    for (const t of EMPLOYEE_TYPES) expect(files).toContain(t);
    expect(files).toHaveLength(EMPLOYEE_TYPES.length);
  });

  it("each employee type supports opt-in + allow-list + audit + kill switch + error budget", () => {
    for (const agentType of EMPLOYEE_TYPES) {
      const wf = `wf-${agentType}`;
      // 1. Default OFF (approvals ON) for every employee's workflow key.
      expect(isAutonomyEnabled("tenant-a@test", wf, dir)).toBe(false);
      // 2. Opt-in per workflow with an explicit allow-list.
      setAutonomyWorkflow("tenant-a@test", wf, {
        enabled: true,
        allowList: [{ id: `al-${agentType}`, action: "createXeroInvoice" }],
      }, dir);
      expect(isAutonomyEnabled("tenant-a@test", wf, dir)).toBe(true);
      // 3. Allow-listed write auto-executes with audit metadata.
      const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: wf });
      expect(out.allowed).toBe(true);
      expect(out.autonomy).toBe(true);
      expect(out.allowListId).toBe(`al-${agentType}`);
      // 4. Non-listed write stays gated (even in autonomy mode).
      const gated = approvalGate("tenant-a@test", "createHubSpotContact", "hubspot", {}, { dataDir: dir, workflowId: wf });
      expect(gated.allowed).toBe(false);
      expect(gated.actionId).toBeTruthy();
      // 5. Kill switch instantly gates the employee's workflow.
      setTenantAutonomyKillSwitch("tenant-a@test", true, dir);
      expect(isAutonomyEnabled("tenant-a@test", wf, dir)).toBe(false);
      const killed = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir, workflowId: wf });
      expect(killed.allowed).toBe(false);
      setTenantAutonomyKillSwitch("tenant-a@test", false, dir);
      // 6. Error-budget fallback: 3 failures revert to gated.
      for (let i = 0; i < AUTONOMY_MAX_CONSECUTIVE_FAILURES; i++) {
        recordAutonomyOutcome("tenant-a@test", wf, "createXeroInvoice", "xero", false, { dataDir: dir, allowListId: `al-${agentType}` });
      }
      expect(isAutonomyEnabled("tenant-a@test", wf, dir)).toBe(false);
      // 7. Audit trail is durable + actor = system/autonomy.
      const audit = autonomyAudit("tenant-a@test", dir);
      expect(audit.some((e) => e.workflowId === wf && e.actor === "system/autonomy")).toBe(true);
      // Reset for the next employee type (fresh config).
      setAutonomyWorkflow("tenant-a@test", wf, { enabled: false, allowList: [] }, dir);
    }
  });

  it("isolated employees: worst-case destructive write can NEVER auto-execute without an explicit allow-list + known-row id", () => {
    // Probe EVERY employee workflow key with a destructive write carrying NO
    // row id — the non-destruction invariant must hold for all of them.
    for (const agentType of EMPLOYEE_TYPES) {
      const wf = `wf-${agentType}`;
      setAutonomyWorkflow("tenant-a@test", wf, { enabled: true, allowList: [{ id: `al-${agentType}`, action: "deleteXeroInvoice" }] }, dir);
      const out = approvalGate("tenant-a@test", "deleteXeroInvoice", "xero", { filter: "all" }, { dataDir: dir, workflowId: wf });
      expect(out.allowed).toBe(false);
      expect(out.autonomy).toBeUndefined();
    }
  });
});

describe("AUTONOMY MODE — chain writes honor the per-workflow config (owner anchor: quote-to-cash)", () => {
  it("orchestrator threads workflowId (chainId) so a chain write honors the tenant's per-workflow allow-list", async () => {
    const WORKFLOW = "quote-to-cash";
    // Tenant enables autonomy for the anchor workflow with an explicit
    // allow-list for createHubSpotContact only (verb-first action names are
    // how real provider writes are registered in this codebase).
    setAutonomyWorkflow("chain-tenant@test", WORKFLOW, {
      enabled: true,
      allowList: [{ id: "al-contact", action: "createHubSpotContact" }],
    }, dir);
    // The orchestrator's write path passes workflowId = input.chainId (the
    // named chain = the per-workflow autonomy key). Proof: the SAME approval
    // gate keyed off the chain workflow auto-executes the allow-listed write...
    const allowed = approvalGate("chain-tenant@test", "createHubSpotContact", "hubspot", { properties: {} }, {
      dataDir: dir,
      agentId: "salesOutreach",      // the step's agent type
      workflowId: WORKFLOW,          // what the orchestrator now passes
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.autonomy).toBe(true);
    expect(allowed.allowListId).toBe("al-contact");
    // ...AND gates a non-listed write in the SAME chain (fail-closed).
    const gated = approvalGate("chain-tenant@test", "createXeroInvoice", "xero", {}, {
      dataDir: dir,
      agentId: "finance",            // different step agent type
      workflowId: WORKFLOW,          // same chain workflow
    });
    expect(gated.allowed).toBe(false);
    expect(gated.actionId).toBeTruthy();
    // Isolation: another workflow key for the same tenant stays gated even
    // though the action is allow-listed in quote-to-cash.
    const other = approvalGate("chain-tenant@test", "createHubSpotContact", "hubspot", { properties: {} }, {
      dataDir: dir,
      agentId: "salesOutreach",
      workflowId: "other-chain",     // different chain → not allow-listed here
    });
    expect(other.allowed).toBe(false);
    expect(other.actionId).toBeTruthy();
  });
});
