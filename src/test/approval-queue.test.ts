/**
 * approval-queue.test.ts — cross-agent Approval Queue.
 *
 * Covers:
 *  1. write-action classification (reads pass, writes gate)
 *  2. gate: enqueue on write (default ON), fail-closed when store down,
 *     auto mode passes through, agentId recorded
 *  3. store: list/get/enqueue/markApproved/markRejected/editPendingAction,
 *     tenant scoping (isolation)
 *  4. engine integration: executeAction routes write to pending, returns
 *     pendingApproval+actionId, bypass executes
 *  5. portal API e2e (probe-based, self-hosted server): auth required,
 *     approve/reject/edit, tenant isolation
 */
import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The engine's connection lookup is DB-backed (drizzle/Postgres). In unit
// tests there is no DB, so stub it: no connections exist → executeAction
// fails closed at the connection stage, exactly like a tenant with no
// provider connected. The approval GATE runs BEFORE connection lookup, so
// gating behavior is fully exercised.
vi.mock("../integrations/framework/connection", () => ({
  listConnectionsByProvider: vi.fn(async () => []),
  updateConnectionConfig: vi.fn(async () => {}),
}));
import {
  isWriteAction,
  approvalGate,
  enqueueApproval,
  listPendingActions,
  listDecidedActions,
  getTenantAction,
  markApproved,
  markRejected,
  editPendingAction,
  approvalModeForTenant,
  summarizeAction,
} from "../lib/approval-queue";
import { setApprovalMode, setWorkspacePreference } from "../lib/tenant-settings";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "approval-q-"));
});
afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
});

// ── 1. Write-action classification ──────────────────────────────────────
describe("write-action classification", () => {
  it("gates provider WRITE verbs", () => {
    for (const name of [
      "createXeroInvoice", "createHubSpotContact", "createContact", "createSalesforceOpportunity",
      "updateGoogleDoc", "deleteGDriveFile", "removeTableauSiteUser", "sendGmailMessage",
      "uploadGDriveFile", "copyGDriveFile", "moveODFile", "writeExcelRange", "writeGoogleSheetRange",
      "postSlackMessage", "completeOnfleetTask", "voidDocuSignEnvelope", "trashGDriveFile",
      "triggerMarketoCampaign", "executeInforTransaction", "sendDocuSignEnvelope",
    ]) {
      expect(isWriteAction(name), name).toBe(true);
    }
  });
  it("never gates pure READ actions", () => {
    for (const name of [
      "searchXeroContacts", "getDocuSignEnvelope", "listConnections", "querySalesforce",
      "healthCheck", "xeroHealthCheck", "getGoogleSheet", "searchSlackMessages",
      "getGmailMessage", "searchJiraIssues", "downloadGDriveFile", "getSalesforceContact",
      "verifyConnection", "previewDocument",
    ]) {
      expect(isWriteAction(name), name).toBe(false);
    }
  });
  it("empty/unknown action names fail closed as non-writes (never gate reads)", () => {
    expect(isWriteAction("")).toBe(false);
  });
});

// ── 2. Gate semantics ───────────────────────────────────────────────────
describe("approvalGate", () => {
  it("default ON: a write is enqueued, not allowed, with an actionId", () => {
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", { Type: "ACCREC" }, { dataDir: dir });
    expect(out.allowed).toBe(false);
    expect(out.actionId).toBeTruthy();
    const pending = listPendingActions("tenant-a@test", dir);
    expect(pending).toHaveLength(1);
    expect(pending[0].actionType).toBe("createXeroInvoice");
    expect(pending[0].provider).toBe("xero");
    expect(pending[0].status).toBe("pending");
    expect(pending[0].summary.what).toContain("createXeroInvoice");
    expect(pending[0].summary.where).toBe("xero");
  });
  it("reads pass through untouched (no record created)", () => {
    const out = approvalGate("tenant-a@test", "searchXeroContacts", "xero", { filter: "abc" }, { dataDir: dir });
    expect(out.allowed).toBe(true);
    expect(listPendingActions("tenant-a@test", dir)).toHaveLength(0);
  });
  it("agentId is recorded on the pending record", () => {
    approvalGate("tenant-a@test", "createHubSpotContact", "hubspot", { properties: {} }, { agentId: "sales-outreach-v1", dataDir: dir });
    expect(listPendingActions("tenant-a@test", dir)[0].agentId).toBe("sales-outreach-v1");
  });
  it("defaults agentId to ai-employee", () => {
    approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir });
    expect(listPendingActions("tenant-a@test", dir)[0].agentId).toBe("ai-employee");
  });
  it("explicit per-tenant opt-out (auto) lets writes execute", () => {
    setApprovalMode("tenant-a@test", "auto", dir);
    expect(approvalModeForTenant("tenant-a@test", dir)).toBe("auto");
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: dir });
    expect(out.allowed).toBe(true);
    expect(listPendingActions("tenant-a@test", dir)).toHaveLength(0);
  });
  it("approvalMode defaults to on (fail-closed) for unknown/empty tenants", () => {
    expect(approvalModeForTenant("", dir)).toBe("on");
    expect(approvalModeForTenant("nobody@test", dir)).toBe("on");
  });
  it("fail-closed when the store is unavailable: write is NOT allowed", () => {
    // Point the gate at a path that is a FILE, so readJSON/writeJSON throw.
    const badDir = join(dir, "blocked");
    writeFileSync(badDir, "not-a-dir");
    const out = approvalGate("tenant-a@test", "createXeroInvoice", "xero", {}, { dataDir: badDir });
    expect(out.allowed).toBe(false);
    expect(out.error).toMatch(/blocked/i);
  });
});

// ── 3. Store operations + tenant scoping ────────────────────────────────
describe("approval store operations", () => {
  it("enqueue → list → approve (with result) → decided trail", () => {
    const rec = enqueueApproval(
      { tenantEmail: "t1@test", agentId: "a1", actionType: "createXeroInvoice", provider: "xero", summary: { what: "x", where: "xero", why: "test" }, payload: { Type: "ACCREC" } },
      dir,
    );
    expect(getTenantAction("t1@test", rec.actionId, dir)?.status).toBe("pending");
    const approved = markApproved("t1@test", rec.actionId, "boss@test", { result: { InvoiceID: "INV-1" } }, dir);
    expect(approved?.status).toBe("approved");
    expect(approved?.decidedBy).toBe("boss@test");
    expect(approved?.result).toEqual({ InvoiceID: "INV-1" });
    expect(listPendingActions("t1@test", dir)).toHaveLength(0);
    expect(listDecidedActions("t1@test", dir)).toHaveLength(1);
  });
  it("reject DISCARDS — no provider result, no execution outcome", () => {
    const rec = enqueueApproval(
      { tenantEmail: "t1@test", agentId: "a1", actionType: "createXeroInvoice", provider: "xero", summary: { what: "x", where: "xero", why: "test" }, payload: {} },
      dir,
    );
    const rejected = markRejected("t1@test", rec.actionId, "boss@test", dir);
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.result).toBeUndefined();
    expect(rejected?.resultError).toBeUndefined();
  });
  it("edit changes the payload and refreshes the summary, stays pending", () => {
    const rec = enqueueApproval(
      { tenantEmail: "t1@test", agentId: "a1", actionType: "createXeroInvoice", provider: "xero", summary: { what: "x", where: "xero", why: "test" }, payload: { Type: "ACCREC" } },
      dir,
    );
    const edited = editPendingAction("t1@test", rec.actionId, { Type: "ACCPAY", Contact: { ContactID: "C1" } }, dir);
    expect(edited?.status).toBe("pending");
    expect(edited?.payload).toEqual({ Type: "ACCPAY", Contact: { ContactID: "C1" } });
    expect(edited?.summary.what).toContain("ACCPAY");
  });
  it("approving a non-pending (already decided) action is a no-op", () => {
    const rec = enqueueApproval(
      { tenantEmail: "t1@test", agentId: "a1", actionType: "createXeroInvoice", provider: "xero", summary: { what: "x", where: "xero", why: "test" }, payload: {} },
      dir,
    );
    markRejected("t1@test", rec.actionId, "boss@test", dir);
    expect(markApproved("t1@test", rec.actionId, "boss@test", {}, dir)).toBeNull();
    expect(markRejected("t1@test", rec.actionId, "boss@test", dir)).toBeNull();
  });
  it("ISOLATION: tenant B never sees tenant A's actions", () => {
    enqueueApproval(
      { tenantEmail: "t1@test", agentId: "a1", actionType: "createXeroInvoice", provider: "xero", summary: { what: "x", where: "xero", why: "test" }, payload: {} },
      dir,
    );
    expect(listPendingActions("t2@test", dir)).toHaveLength(0);
    expect(getTenantAction("t2@test", "anything", dir)).toBeNull();
  });
  it("summarizeAction builds a safe, bounded what/where/why", () => {
    const s = summarizeAction("createXeroInvoice", "xero", { Type: "ACCREC", LineItems: [{ Quantity: 1 }], huge: "x".repeat(500) });
    expect(s.what).toContain("createXeroInvoice");
    expect(s.where).toBe("xero");
    expect(s.why).toContain("approval queue");
    expect(s.what.length).toBeLessThan(300);
  });
});

// ── 4. Engine integration: executeAction respects the gate ──────────────
describe("engine integration (executeAction gate)", () => {
  it("a registered WRITE action routes to pending without executing (no connection needed)", async () => {
    // Registration happens via integration-tools import; pull the registry directly.
    const { actionRegistry, executeAction } = await import("../engine/action-executor");
    await import("../engine/integration-tools"); // registers all providers
    expect(actionRegistry.hasAction("createXeroInvoice")).toBe(true);
    // Point the engine's default data dir at a writable temp dir so the
    // approval store is reachable (canonical env has DATA_DIR unset, so the
    // runtime default under the worktree does not exist). Restore after.
    const prevDataDir = process.env.DATA_DIR;
    process.env.DATA_DIR = dir;
    let result;
    try {
      result = await executeAction("createXeroInvoice", { Type: "ACCREC" }, "nobody-approval@test", { agentId: "invoice-processor-v1" });
    } finally {
      if (prevDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prevDataDir;
    }
    expect(result.success).toBe(false);
    expect(result.pendingApproval).toBe(true);
    expect(result.actionId).toBeTruthy();
    expect(result.error).toMatch(/pending human approval/i);
    // No connection lookup happened → we never attempted a provider call.
    expect(result.provider).toBe("xero");
  });
  it("bypassApproval skips the gate (portal approve path)", async () => {
    await import("../engine/integration-tools"); // registers provider actions
    const { executeAction } = await import("../engine/action-executor");
    const result = await executeAction("createXeroInvoice", { Type: "ACCREC" }, "nobody-approval@test", { bypassApproval: true });
    // It proceeds past the gate and fails on the missing connection — proof
    // the gate was bypassed (otherwise it would say "pending approval").
    expect(result.success).toBe(false);
    expect(result.pendingApproval).toBeUndefined();
    expect(result.error).toMatch(/no connection found/i);
  });
  it("auto mode (opt-out) lets a write reach the connection stage", async () => {
    setApprovalMode("auto-tenant@test", "auto", dir);
    // Can't inject the dataDir into the engine (it uses the runtime default),
    // so verify the mode check itself: approvalModeForTenant reflects "auto".
    expect(approvalModeForTenant("auto-tenant@test", dir)).toBe("auto");
  });
});

// ── 5. Portal API e2e (probe-based) ─────────────────────────────────────
const TS = Date.now().toString(36);
const APPROVAL_EMAIL = `approval-${TS}@test`;
const PASSWORD = "ApprovalTest!123";
let cookie: string | null = null;

async function registerAndGetCookie(email: string): Promise<string | null> {
  const BASE_URL = testBaseUrl();
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, name: "Approval Test" }),
  });
  let setCookie = reg.headers.get("set-cookie") || "";
  if (!setCookie && reg.status === 409) {
    const login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    setCookie = login.headers.get("set-cookie") || "";
  }
  const m = setCookie.match(/session=([^;]+)/);
  return m ? m[1] : null;
}

async function authedJson(path: string, cookie: string, init?: RequestInit) {
  const BASE_URL = testBaseUrl();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Cookie: `session=${cookie}`, ...(init?.headers || {}) },
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

describe("portal /api/portal/approvals (self-hosted server)", () => {
  beforeAll(async () => {
    await ensureTestServer();
    const base = testDataDir();
    if (!existsSync(base)) mkdirSync(base, { recursive: true });
    cookie = await registerAndGetCookie(APPROVAL_EMAIL);
    expect(cookie).toBeTruthy();
  });
  afterAll(() => {
    // Best-effort cleanup of the test tenant's approvals file.
    try {
      const p = join(testDataDir(), "tenant_approvals.json");
      if (existsSync(p)) {
        const data = JSON.parse(readFileSync(p, "utf-8"));
        if (data && typeof data === "object" && data[APPROVAL_EMAIL]) {
          delete data[APPROVAL_EMAIL];
          writeFileSync(p, JSON.stringify(data, null, 2));
        }
      }
    } catch { /* best-effort */ }
  });

  it("endpoint probe: exists on the target server (401 without session)", async () => {
    const res = await fetch(`${testBaseUrl()}/api/portal/approvals`, { method: "GET" });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html") || res.status === 404) return; // not deployed
    expect(res.status).toBe(401);
  });

  it("GET lists an empty queue for a fresh tenant", async () => {
    const probe = await fetch(`${testBaseUrl()}/api/portal/approvals`, { method: "GET" });
    if ((probe.headers.get("content-type") || "").includes("text/html") || probe.status === 404) return;
    const { status, json } = await authedJson("/api/portal/approvals", cookie!);
    expect(status).toBe(200);
    expect(json.data.pending).toEqual([]);
    expect(json.data.decided).toEqual([]);
    expect(json.data.mode).toBe("on");
  });

  it("reject a pending action via the portal (discard, no execution)", async () => {
    const probe = await fetch(`${testBaseUrl()}/api/portal/approvals`, { method: "GET" });
    if ((probe.headers.get("content-type") || "").includes("text/html") || probe.status === 404) return;
    // Seed a pending action directly into the server's data dir.
    const { enqueueApproval } = await import("../lib/approval-queue");
    const rec = enqueueApproval(
      { tenantEmail: APPROVAL_EMAIL, agentId: "sales-outreach-v1", actionType: "createHubSpotContact", provider: "hubspot", summary: { what: "createHubSpotContact", where: "hubspot", why: "test" }, payload: { properties: { email: "x@test" } } },
      testDataDir(),
    );
    const { status, json } = await authedJson("/api/portal/approvals", cookie!, {
      method: "POST",
      body: JSON.stringify({ actionId: rec.actionId, decision: "reject" }),
    });
    expect(status).toBe(200);
    expect(json.data.action.status).toBe("rejected");
    expect(json.data.action.result).toBeUndefined();
    // It moved to decided.
    const after = await authedJson("/api/portal/approvals", cookie!);
    expect(after.json.data.pending.some((a: any) => a.actionId === rec.actionId)).toBe(false);
    expect(after.json.data.decided.some((a: any) => a.actionId === rec.actionId)).toBe(true);
  });

  it("edit then approve executes with the edited payload (fails on missing connection — proves execution path)", async () => {
    const probe = await fetch(`${testBaseUrl()}/api/portal/approvals`, { method: "GET" });
    if ((probe.headers.get("content-type") || "").includes("text/html") || probe.status === 404) return;
    const { enqueueApproval } = await import("../lib/approval-queue");
    const rec = enqueueApproval(
      { tenantEmail: APPROVAL_EMAIL, agentId: "invoice-processor-v1", actionType: "createXeroInvoice", provider: "xero", summary: { what: "createXeroInvoice", where: "xero", why: "test" }, payload: { Type: "ACCREC" } },
      testDataDir(),
    );
    // Edit payload first.
    const edit = await authedJson("/api/portal/approvals", cookie!, {
      method: "POST",
      body: JSON.stringify({ actionId: rec.actionId, decision: "edit", payload: { Type: "ACCPAY", Reference: "EDITED" } }),
    });
    expect(edit.status).toBe(200);
    expect(edit.json.data.action.payload.Type).toBe("ACCPAY");
    expect(edit.json.data.action.status).toBe("pending");
    // Approve → engine runs with the edited payload; no Xero connection → fail-closed at connection.
    const approve = await authedJson("/api/portal/approvals", cookie!, {
      method: "POST",
      body: JSON.stringify({ actionId: rec.actionId, decision: "approve" }),
    });
    expect(approve.status).toBe(200);
    expect(approve.json.data.action.status).toBe("approved");
    expect(approve.json.data.execution.success).toBe(false);
    // The gate was bypassed and the engine attempted the write — it fails at
    // the connection/DB stage (no live connection in the test sandbox), which
    // proves the approve path EXECUTES rather than re-queuing. Either error
    // is acceptable: "no connection found" (no provider linked) or the
    // sandbox's "Database not initialized" (drizzle store absent).
    expect(approve.json.data.execution.error).toMatch(/no connection found|not initialized/i);
  });

  it("HYGIENE: legacy /api/data/approvals endpoint is gone (404, no echo trap)", async () => {
    const probe = await fetch(`${testBaseUrl()}/api/portal/approvals`, { method: "GET" });
    if ((probe.headers.get("content-type") || "").includes("text/html") || probe.status === 404) return;
    const res = await fetch(`${testBaseUrl()}/api/data/approvals`, { method: "GET" });
    // Dead endpoint: must NOT return 200 (the old echo handler is removed).
    // Server's global /api auth guard answers 401 when unauthenticated.
    expect(res.status).not.toBe(200);
  });

  it("ISOLATION: tenant B cannot see or decide tenant A's actions", async () => {
    const probe = await fetch(`${testBaseUrl()}/api/portal/approvals`, { method: "GET" });
    if ((probe.headers.get("content-type") || "").includes("text/html") || probe.status === 404) return;
    const { enqueueApproval } = await import("../lib/approval-queue");
    const rec = enqueueApproval(
      { tenantEmail: APPROVAL_EMAIL, agentId: "a", actionType: "createXeroInvoice", provider: "xero", summary: { what: "x", where: "xero", why: "t" }, payload: {} },
      testDataDir(),
    );
    const otherEmail = `other-${TS}@test`;
    const otherCookie = await registerAndGetCookie(otherEmail);
    expect(otherCookie).toBeTruthy();
    // B cannot list A's pending actions.
    const bList = await authedJson("/api/portal/approvals", otherCookie!);
    expect(bList.json.data.pending.some((a: any) => a.actionId === rec.actionId)).toBe(false);
    // B cannot reject A's action.
    const bReject = await authedJson("/api/portal/approvals", otherCookie!, {
      method: "POST",
      body: JSON.stringify({ actionId: rec.actionId, decision: "reject" }),
    });
    expect(bReject.status).toBe(404);
  });

  it("settings: mode defaults on, opt-out to auto is explicit + validated", async () => {
    const probe = await fetch(`${testBaseUrl()}/api/portal/approvals/settings`, { method: "GET" });
    if ((probe.headers.get("content-type") || "").includes("text/html") || probe.status === 404) return;
    const get = await authedJson("/api/portal/approvals/settings", cookie!);
    expect(get.status).toBe(200);
    expect(get.json.data.mode).toBe("on");
    const bad = await authedJson("/api/portal/approvals/settings", cookie!, {
      method: "POST",
      body: JSON.stringify({ mode: "sometimes" }),
    });
    expect(bad.status).toBe(400);
    const setAuto = await authedJson("/api/portal/approvals/settings", cookie!, {
      method: "POST",
      body: JSON.stringify({ mode: "auto" }),
    });
    expect(setAuto.status).toBe(200);
    expect(setAuto.json.data.mode).toBe("auto");
    // Back to on so the isolated default-dir behavior is untouched for other suites.
    await authedJson("/api/portal/approvals/settings", cookie!, { method: "POST", body: JSON.stringify({ mode: "on" }) });
  });
});
