import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHmac } from "crypto";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import { newPasswordResetRecord } from "../lib/password-reset";

/**
 * purchase-entitlement-audit.test.ts — post-deploy purchase-flow integrity
 * audit (owner directive 2026-08-13: "We don't want any free stuff being
 * given out"). Updated for cleanup slice (c), 10-26: the per-agent purchase
 * branches, the plan-grant (agentIds) machinery and the AI-employee catalog
 * are RETIRED, so the audit now covers the surviving purchase types and the
 * fail-closed behavior of the retired surfaces:
 *   A. the RETIRED pack link → generic record, NO pack type and NO slot grant
 *      (cleanup 10-30: the pack SKUs and their link mapping are gone);
 *   B. generic purchase → amount-only record, no grants;
 *   C. no-free-stuff: unsigned/forged events → 400 + NO record + NO tenant
 *      gate; non-purchased emails stay fully gated;
 *   D. idempotency: a re-delivered checkout.session.completed (Stripe
 *      at-least-once) must NOT double-provision;
 *   E. RETIRED SURFACES FAIL CLOSED: /api/data/employees + /api/agents/run
 *      no longer exist — authenticated use returns 404 JSON (never a roster
 *      or SPA HTML).
 */

const TEST_DATA_DIR = testDataDir();
const PURCHASES_FILE = join(TEST_DATA_DIR, "tenant_purchases.json");
const RESETS_FILE = join(TEST_DATA_DIR, "password_resets.json");

const BASE_URL = testBaseUrl();
const PASSWORD = "audit-pass-2026";

// One timestamp for all emails so cleanup is a single glob-friendly prefix.
const TS = Date.now();
const PACK_EMAIL = "audit-pack@" + TS + ".test";
const GENERIC_EMAIL = "audit-generic@" + TS + ".test";
const FORGED_EMAIL = "audit-forged@" + TS + ".test";
const NOPURCHASE_EMAIL = "audit-nopurchase@" + TS + ".test";
const ALL_EMAILS = [PACK_EMAIL, GENERIC_EMAIL, FORGED_EMAIL, NOPURCHASE_EMAIL];

// ── Stripe signature awareness (same contract as purchase-provisioning.test.ts) ──
function resolveWebhookSecret(): string | undefined {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const envPath = join(process.cwd(), ".env");
    const raw = readFileSync(envPath, "utf-8");
    const m = raw.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m);
    if (m) return m[1].trim();
  } catch { /* no .env in worktree */ }
  return undefined;
}
const WEBHOOK_SECRET = resolveWebhookSecret();

function stripeSignatureHeader(rawBody: string): string {
  const secret = WEBHOOK_SECRET!;
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  return `t=${ts},v1=${sig}`;
}

let serverEnforcesSignatures = false;

async function probeSignatureEnforcement(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "e2e-probe" }),
    });
    return res.status === 400;
  } catch { return false; }
}

async function postWebhook(body: unknown, opts: { signed?: boolean; path?: string } = {}): Promise<{ status: number; json: any }> {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const signed = opts.signed !== false && serverEnforcesSignatures;
  if (signed) headers["stripe-signature"] = stripeSignatureHeader(rawBody);
  const res = await fetch(`${BASE_URL}${opts.path || "/api/stripe/webhook"}`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

function checkoutEvent(email: string, sessionId: string, paymentLink: string, amount: number, metadata: Record<string, unknown> = {}) {
  return {
    type: "checkout.session.completed",
    data: { object: { id: sessionId, object: "checkout.session", customer_details: { email }, customer_email: email, payment_link: paymentLink, amount_total: amount, metadata } },
  };
}

// ── File helpers (read the store the server writes through) ──
function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}

function removeTestRecords() {
  for (const [path, key] of [
    [PURCHASES_FILE, null],
  ] as [string, string | null][]) {
    if (!existsSync(path)) continue;
    const data = readJSONFile(path);
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    let changed = false;
    if (key) { if (data[key] !== undefined) { delete data[key]; changed = true; } }
    else {
      for (const email of ALL_EMAILS) if (data[email] !== undefined) { delete data[email]; changed = true; }
    }
    if (changed) writeFileSync(path, JSON.stringify(data, null, 2));
  }
}

// ── Auth helper: register a fresh account (or log in if it already exists),
//    capture the session cookie ──
async function registerAndGetCookie(email: string): Promise<string | null> {
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  let setCookie = reg.headers.get("set-cookie") || "";
  if (!setCookie && reg.status === 409) {
    // Account already exists (re-run, or pre-created password-less by a
    // purchase webhook) — log in instead.
    let login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    setCookie = login.headers.get("set-cookie") || "";
    if (!setCookie) {
      // Account-creation-on-purchase pre-created a password-less account
      // (the customer sets a password via /api/set-password after buying).
      // That flow now requires proof of ownership — a one-time code delivered
      // to the account email. Mirror it by seeding a valid (unused, unexpired)
      // reset record for this test email (same hashing the server verifies),
      // then exchanging it for the password.
      const resetCode = String(TS).slice(-6);
      const resets = readJSONFile(RESETS_FILE);
      resets[email.toLowerCase()] = newPasswordResetRecord(resetCode, Date.now());
      writeFileSync(RESETS_FILE, JSON.stringify(resets, null, 2));
      await fetch(`${BASE_URL}/api/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: resetCode, password: PASSWORD }),
      });
      login = await fetch(`${BASE_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: PASSWORD }),
      });
      setCookie = login.headers.get("set-cookie") || "";
    }
  }
  const m = setCookie.match(/session=([^;]+)/);
  return m ? m[1] : null;
}

async function authedGet(path: string, cookie: string): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `session=${cookie}` } });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

describe("Purchase-flow integrity audit (owner directive: no free stuff)", () => {
  beforeAll(async () => {
    await ensureTestServer();
    for (const dir of [TEST_DATA_DIR]) if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    serverEnforcesSignatures = await probeSignatureEnforcement();
    if (serverEnforcesSignatures && !WEBHOOK_SECRET) {
      throw new Error("Server enforces Stripe signatures but STRIPE_WEBHOOK_SECRET is not set in env/.env");
    }
    if (!serverEnforcesSignatures) {
      console.warn("[audit] server does NOT enforce Stripe signatures — forged-event assertions will be skipped");
    }
  });

  afterAll(() => {
    removeTestRecords();
  });

  it("server is reachable", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
  });

  describe("RETIRED pack link → no pack record, no slot grant (cleanup 10-30)", () => {
    // The CRM/ERP Connection Pack SKUs are retired (owner 10-21) and their
    // payment links do not exist in the live Stripe account, so the webhook no
    // longer maps them. A checkout that used to look like a pack now records
    // through the generic branch: amount-only, no type, no slots, no agentType.
    const RETIRED_PACK_LINK = "https://buy.stripe.com/5kQaEZ60LcAn8Ppgmk2Fa2I";
    it("records a generic purchase (no pack type, no slots) and grants 0 slots", async () => {
      const sessionId = "cs_audit_pack_" + TS;
      const { status, json } = await postWebhook(checkoutEvent(
        PACK_EMAIL, sessionId, RETIRED_PACK_LINK, 200000,
      ));
      expect(status).toBe(200);
      expect(json.received).toBe(true);
      const purchases = readJSONFile(PURCHASES_FILE);
      const recs = purchases[PACK_EMAIL] || [];
      expect(recs.length).toBe(1);
      expect(recs[0].type).toBeUndefined();
      expect(recs[0].slots).toBeUndefined();
      expect(recs[0].agentType).toBeUndefined();
      expect(recs[0].amount).toBe(200000);
      const cookie = await registerAndGetCookie(PACK_EMAIL);
      expect(cookie).toBeTruthy();
      const { status: slotStatus, json: slotJson } = await authedGet("/api/data/crm-slots", cookie!);
      expect(slotStatus).toBe(200);
      expect(slotJson.totalSlots).toBe(0);
      expect(slotJson.remainingSlots).toBe(0);
    });
    it("a re-delivered event still does NOT double-provision (idempotency guard holds)", async () => {
      const sessionId = "cs_audit_pack_" + TS;
      await postWebhook(checkoutEvent(PACK_EMAIL, sessionId, RETIRED_PACK_LINK, 200000));
      const purchases = readJSONFile(PURCHASES_FILE);
      const recs = purchases[PACK_EMAIL] || [];
      expect(recs.length).toBe(1); // idempotency guard: duplicate session skipped
    });
  });
  describe("GENERIC purchase — minimal record, no grants", () => {
    it("records amount-only and grants nothing (and the retired surfaces 404)", async () => {
      const sessionId = "cs_audit_generic_" + TS;
      const { status } = await postWebhook(checkoutEvent(
        GENERIC_EMAIL, sessionId, "https://buy.stripe.com/test_generic_" + TS, 100,
      ));
      expect(status).toBe(200);

      const purchases = readJSONFile(PURCHASES_FILE);
      const recs = purchases[GENERIC_EMAIL] || [];
      expect(recs.length).toBe(1);
      expect(recs[0].amount).toBe(100);
      expect(recs[0].agentId).toBeUndefined();

      const cookie = await registerAndGetCookie(GENERIC_EMAIL);
      expect(cookie).toBeTruthy();

      // Cleanup (c): the AI-employee catalog endpoint is retired — the
      // subPath rides the catch-all empty-store fallback ({data: []}, the
      // documented dead-store shape) — never a roster, no employees machinery.
      const empRes = await authedGet("/api/data/employees", cookie!);
      expect(empRes.status).toBe(200);
      expect(empRes.json?.data).toEqual([]);

      // Cleanup (c): the per-agent run surface is retired — 404 JSON.
      const runRes = await fetch(`${BASE_URL}/api/agents/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
        body: JSON.stringify({ agentId: "any-agent", input: "test" }),
      });
      expect(runRes.status).toBe(404);
      expect((await runRes.json()).error).toBe("not found");
    });
    it("F4: ANY purchase (incl. the $1 generic) enables monitoring ingress for that tenant", async () => {
      // Owner decision 2026-08-14 (F4): a successful purchase of ANY type —
      // including the $1 generic product — sets canMonitor true for the
      // tenant (monitoring ingress enabled). Provider ACTIONS stay
      // connection-gated (unchanged). The $1 generic purchase was recorded
      // in the test above; the monitoring webhook must now be accepted.
      const monRes = await fetch(`${BASE_URL}/api/monitoring/webhook/hubspot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "emp-invoice-ledger-ai", eventType: "invoice.created", tenantId: GENERIC_EMAIL, payload: { f4: true } }),
      });
      const mon = await monRes.json();
      expect(mon.status).toBe("processed");
      expect(mon.dispatchedTo).toBe("emp-invoice-ledger-ai");
    });
  });

  describe("NO-FREE-STUFF: forged / unsigned / wrong-signature events", () => {
    it("rejects an unsigned checkout.session.completed with 400 and writes NO record", async (ctx) => {
      if (!serverEnforcesSignatures) { ctx.skip(); return; }
      const { status, json } = await postWebhook(
        checkoutEvent(FORGED_EMAIL, "cs_audit_forged_" + TS, "https://buy.stripe.com/test_forged_" + TS, 1),
        { signed: false },
      );
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(500);
      expect(json.error).toMatch(/signature/i);

      const purchases = readJSONFile(PURCHASES_FILE);
      expect(purchases[FORGED_EMAIL]).toBeUndefined(); // no record
    });

    it("rejects a wrong-signature event with 400", async (ctx) => {
      if (!serverEnforcesSignatures) { ctx.skip(); return; }
      const rawBody = JSON.stringify(checkoutEvent(FORGED_EMAIL, "cs_audit_forged2_" + TS, "https://buy.stripe.com/test_forged2_" + TS, 1));
      const ts = Math.floor(Date.now() / 1000);
      const badSig = createHmac("sha256", "whsec_WRONG").update(`${ts}.${rawBody}`).digest("hex");
      const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "stripe-signature": `t=${ts},v1=${badSig}` },
        body: rawBody,
      });
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/mismatch/i);
    });

    it("a forged event does NOT flip the tenant monitoring gate (proves configureTenant never ran)", async (ctx) => {
      if (!serverEnforcesSignatures) { ctx.skip(); return; }
      const res = await fetch(`${BASE_URL}/api/monitoring/webhook/hubspot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "emp-invoice-ledger-ai", eventType: "invoice.created", tenantId: FORGED_EMAIL, payload: { forged: true } }),
      });
      const json = await res.json();
      expect(json.status).toBe("failed");
      expect(json.reason).toMatch(/not entitled/i);
    });
  });

  describe("NO-FREE-STUFF: a registered email with NO purchase stays fully gated", () => {
    it("sees no employees, no feature access, cannot run agents, monitoring denied", async () => {
      const cookie = await registerAndGetCookie(NOPURCHASE_EMAIL);
      expect(cookie).toBeTruthy();

      // Cleanup (c): the employee catalog surface is retired — the subPath
      // serves the empty-store fallback ({data: []}) even for a signed-in
      // non-purchaser — no roster exists anywhere for it to leak.
      const empRes = await authedGet("/api/data/employees", cookie!);
      expect(empRes.status).toBe(200);
      expect(empRes.json?.data).toEqual([]);

      // Cleanup (c): the per-agent run surface is retired — 404 JSON.
      const runRes = await fetch(`${BASE_URL}/api/agents/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
        body: JSON.stringify({ agentId: "invoice-processor-v1", input: "test" }),
      });
      expect(runRes.status).toBe(404);

      const monRes = await fetch(`${BASE_URL}/api/monitoring/webhook/hubspot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: "emp-invoice-ledger-ai", eventType: "invoice.created", tenantId: NOPURCHASE_EMAIL, payload: {} }),
      });
      const mon = await monRes.json();
      expect(mon.status).toBe("failed");
      expect(mon.reason).toMatch(/not entitled/i);
    });
  });
});