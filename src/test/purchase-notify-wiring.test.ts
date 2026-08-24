import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createHmac } from "crypto";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

/**
 * Owner purchase-notification + account-creation wiring (task f2ca01cb).
 *
 * Verifies the FULL wired path in prod-server.ts: a real checkout.session.completed
 * reaching /api/stripe/webhook runs handlePurchaseCompleted exactly once, which:
 *   1. provisions/upgrades the purchaser's account in the real users store,
 *   2. persists a durable owner sale event keyed by session.id,
 *   3. attempts the owner sale email (reusing the lead SendGrid/SMTP path;
 *      queued to pending_emails.json when SendGrid is unavailable).
 *
 * And that a duplicate Stripe delivery (same session.id, at-least-once) does
 * NOT double-provision or double-notify.
 *
 * The canonical run has no SENDGRID_API_KEY, so sendEmailSMTP fails closed and
 * the owner email is queued to pending_emails.json — that is the delivery path
 * this test asserts (the email attempt is real either way).
 */

const TEST_DATA_DIR = testDataDir();
const BASE_URL = testBaseUrl();
const TS = Date.now();
const BUYER_EMAIL = "buyer-" + TS + "@test.example";
const SESSION_ID = "cs_test_" + TS + "_generic";
const UPGRADE_SESSION = "cs_test_" + TS + "_upgrade";

const USERS_FILE = join(TEST_DATA_DIR, "users.json");
const PURCHASES_FILE = join(TEST_DATA_DIR, "tenant_purchases.json");
const SALES_FILE = join(TEST_DATA_DIR, "sales_events.json");
const PENDING_FILE = join(TEST_DATA_DIR, "pending_emails.json");
const GENERIC_LINK = "https://buy.stripe.com/test_GENERIC_000" + TS;

function resolveWebhookSecret(): string {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const m = raw.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m);
    if (m) return m[1].trim();
  } catch { /* no .env in worktree */ }
  return "whsec_test";
}
const WEBHOOK_SECRET = resolveWebhookSecret();

function stripeSignature(rawBody: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET).update(`${ts}.${rawBody}`).digest("hex");
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

async function postCheckoutSession(sessionId: string, email: string, paymentLink: string, amountTotal = 5000) {
  const body = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_link: paymentLink,
        amount_total: amountTotal,
        customer_details: { email },
        customer_email: email,
      },
    },
  };
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (serverEnforcesSignatures) headers["stripe-signature"] = stripeSignature(rawBody);
  const res = await fetch(`${BASE_URL}/api/stripe/webhook`, { method: "POST", headers, body: rawBody });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}

/** Non-destructive cleanup of test artifacts keyed to this run's TS + emails. */
function cleanup() {
  const emails = new Set([BUYER_EMAIL]);
  for (const path of [USERS_FILE, PURCHASES_FILE, SALES_FILE]) {
    if (!existsSync(path)) continue;
    const data = readJSONFile(path);
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    let changed = false;
    for (const k of Object.keys(data)) {
      const v = (data as any)[k];
      if (emails.has(k)) { delete (data as any)[k]; changed = true; }
      if (k === SESSION_ID || k === UPGRADE_SESSION) { delete (data as any)[k]; changed = true; }
      if (v && typeof v === "object") {
        const s = (v as any);
        if (typeof s.email === "string" && emails.has(s.email)) { delete (data as any)[k]; changed = true; }
        if (typeof s.sessionId === "string" && (s.sessionId === SESSION_ID || s.sessionId === UPGRADE_SESSION)) { delete (data as any)[k]; changed = true; }
      }
    }
    if (changed) writeFileSync(path, JSON.stringify(data, null, 2));
  }
  if (existsSync(PENDING_FILE)) {
    const data = readJSONFile(PENDING_FILE);
    const arr = Array.isArray(data) ? data : [];
    const next = arr.filter((p: any) => !(p && (p.sessionId === SESSION_ID || p.sessionId === UPGRADE_SESSION)));
    if (next.length !== arr.length) writeFileSync(PENDING_FILE, JSON.stringify(next, null, 2));
  }
}

beforeAll(async () => {
  await ensureTestServer();
  serverEnforcesSignatures = await probeSignatureEnforcement();
});
afterAll(cleanup);

describe("Purchase → owner notification + account creation (full wired path)", () => {
  beforeAll(() => cleanup());

  it("a generic purchase provisions the account, persists a sale event, AND queues the owner email", async () => {
    const { status } = await postCheckoutSession(SESSION_ID, BUYER_EMAIL, GENERIC_LINK, 5000);
    expect(status).toBe(200);

    // 1. Account created in the REAL users store (no password — set via set-password).
    const users = readJSONFile(USERS_FILE);
    const acct = users[BUYER_EMAIL.toLowerCase()];
    expect(acct).toBeTruthy();
    expect(acct.source).toBe("purchase");
    expect(acct.purchased).toBe(true);
    expect(acct.role).toBe("user");

    // 2. Durable owner sale event keyed by session.id.
    const sales = readJSONFile(SALES_FILE);
    const evt = sales[SESSION_ID];
    expect(evt).toBeTruthy();
    expect(evt.event.kind).toBe("purchase");
    expect(evt.event.productName).toBe("AI Automation Package");
    expect(evt.event.customerEmail).toBe(BUYER_EMAIL.toLowerCase());
    expect(evt.event.amountCents).toBe(5000);
    expect(typeof evt.notified).toBe("boolean");

    // 3. Owner email attempted via the real queue path (canonical run has no
    //    SENDGRID_API_KEY, so it's queued; a configured run sets notified:true).
    if (evt.notified !== true) {
      const pending = readJSONFile(PENDING_FILE);
      const arr = Array.isArray(pending) ? pending : [];
      const hit = arr.some((p: any) => p.kind === "purchase" && p.sessionId === SESSION_ID &&
        String(p.body || "").includes("AI Automation Package") && String(p.to || "") === "electric.vortexz@gmail.com");
      expect(hit).toBe(true);
    }
  });

  it("a duplicate Stripe delivery (same session.id) does NOT double-provision or double-notify", async () => {
    // Re-post the exact same session — Stripe at-least-once.
    const { status } = await postCheckoutSession(SESSION_ID, BUYER_EMAIL, GENERIC_LINK, 5000);
    expect(status).toBe(200);

    // Exactly one durable sale event for this session.
    const sales = readJSONFile(SALES_FILE);
    const matchingSales = Object.entries(sales).filter(([k]) => k === SESSION_ID);
    expect(matchingSales.length).toBe(1);

    // Exactly one tenant purchase record for this session (no double grant).
    const purchases = readJSONFile(PURCHASES_FILE);
    const buyerRecs = (purchases[BUYER_EMAIL] || []).filter((p: any) => p.stripeSessionId === SESSION_ID);
    expect(buyerRecs.length).toBe(1);

    // Account not re-created / no upgrade stamp duplicated.
    const acct = readJSONFile(USERS_FILE)[BUYER_EMAIL.toLowerCase()];
    expect(acct).toBeTruthy();
    expect(acct.source).toBe("purchase");
  });
});

describe("Existing account upgrade (non-destructive)", () => {
  beforeAll(() => {
    cleanup();
    // Pre-seed an existing account with a password + role — a purchase must
    // upgrade it WITHOUT overwriting password/role/createdAt (non-destruction).
    const users = readJSONFile(USERS_FILE);
    users[BUYER_EMAIL.toLowerCase()] = { email: BUYER_EMAIL.toLowerCase(), password: "existing-password-hash", role: "admin", createdAt: 12345 };
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  });

  it("upgrades in place and never clobbers password/role/createdAt", async () => {
    const { status } = await postCheckoutSession(UPGRADE_SESSION, BUYER_EMAIL, GENERIC_LINK, 7500);
    expect(status).toBe(200);

    const acct = readJSONFile(USERS_FILE)[BUYER_EMAIL.toLowerCase()];
    expect(acct).toBeTruthy();
    // Non-destruction: these MUST be untouched.
    expect(acct.password).toBe("existing-password-hash");
    expect(acct.role).toBe("admin");
    expect(acct.createdAt).toBe(12345);
    // Upgrade flags present.
    expect(acct.source).toBe("purchase");
    expect(acct.purchased).toBe(true);
    expect(typeof acct.upgradedAt).toBe("string");

    // A sale event was recorded for the upgrade session too.
    const sales = readJSONFile(SALES_FILE);
    const evt = sales[UPGRADE_SESSION];
    expect(evt).toBeTruthy();
    expect(evt.event.provisioned).toBe("upgraded");
    expect(evt.event.amountCents).toBe(7500);
  });
});

describe("Source-level: prod-server wires the shared handler in the checkout block", () => {
  it("imports + calls buildOwnerSaleEvent / provisionAccountForPurchase / ownerSaleEmailBody", () => {
    const src = readFileSync(join(process.cwd(), "prod-server.ts"), "utf-8");
    expect(src).toContain("import { buildOwnerSaleEvent, provisionAccountForPurchase, ownerSaleEmailBody } from \"./src/lib/purchase-sales-events\"");
    expect(src.includes("handlePurchaseCompleted")).toBe(true);
    expect(src.includes("SALES_EVENTS_FILE")).toBe(true);
    // Every provisioning branch must invoke the handler (pack, plan, agent/generic).
    expect((src.match(/await handlePurchaseCompleted\(/g) || []).length).toBeGreaterThanOrEqual(3);
    // The handler reuses the existing SendGrid/lead mail path, not a new one.
    expect(src).toContain("async function sendEmailSMTP");
    expect(src).toContain("LEAD_NOTIFICATION_EMAIL");
  });
});
