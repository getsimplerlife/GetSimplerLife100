/**
 * email-lane-201.test.ts — ONE sender, and it is the Brevo lane.
 *
 * Owner order (11-07): "fix the email path to brevo for all things."
 *
 * THE DEFECT THIS PINS
 * prod-server.ts carried its own `sendEmailSMTP` that was SendGrid-HTTP-only and
 * answered `{ sent: false, error: "SENDGRID_API_KEY not configured" }` whenever
 * that key was missing. On the live deployment SENDGRID_API_KEY is EMPTY and the
 * lane is Brevo SMTP, so all four of its callers sent NOTHING: the buyer's
 * confirmation, the owner's new-purchase notice, the password-reset code and the
 * lead notification.
 *
 * WHAT IS ASSERTED
 *  1. The branch NO test had ever covered: a checkout.session.completed carrying
 *     a REAL tier payment link (prod-server's plan branch), proving the account
 *     is created and the buyer's confirmation goes through the SHARED sender.
 *  2. The recorded outcome matches what the provider actually returned — `sent`
 *     is never true without a provider messageId, and a simulated send (no lane)
 *     is never recorded as delivery.
 *  3. The buyer's copy says the charge is MONTHLY, with the tier and amount
 *     derived from the system of record, not from a literal this test invents.
 *  4. A source guard: prod-server imports the shared sender and contains no
 *     second SendGrid call site. It scans CODE with comments stripped, so prose
 *     about the old lane can neither satisfy nor break it.
 *
 * No test here sends real mail: the canonical run has no lane configured, so the
 * shared sender's mock path is what answers — and the assertions are written to
 * hold on a machine WITH a lane too (see the `sent === true` branch below).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
import { PLAN_SPECS, STARTER_PLAN_LINK } from "../lib/stripe-webhook";
import { TIER_SPECS } from "../lib/entitlements";

const REPO_ROOT = join(__dirname, "..", "..");
const TEST_DATA_DIR = testDataDir();
const BASE_URL = testBaseUrl();

const TS = Date.now();
const BUYER_EMAIL = "tier-buyer-" + TS + "@test.example";
const SESSION_ID = "cs_test_" + TS + "_tier_starter";

const USERS_FILE = join(TEST_DATA_DIR, "users.json");
const PURCHASES_FILE = join(TEST_DATA_DIR, "tenant_purchases.json");
const SALES_FILE = join(TEST_DATA_DIR, "sales_events.json");
const PENDING_FILE = join(TEST_DATA_DIR, "pending_emails.json");

/** The price the site and Stripe charge for the tier — from the system of record. */
const STARTER_MONTHLY_CENTS = TIER_SPECS.starter.monthlyUsd * 100;
const STARTER_PRODUCT_NAME = PLAN_SPECS.starter.productName;

function resolveWebhookSecret(): string {
  if (process.env.STRIPE_WEBHOOK_SECRET) return process.env.STRIPE_WEBHOOK_SECRET;
  try {
    const raw = readFileSync(join(process.cwd(), ".env"), "utf-8");
    const m = raw.match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m);
    if (m) return m[1].trim();
  } catch {
    /* no .env in a clean worktree */
  }
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
  } catch {
    return false;
  }
}

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

/** Post a checkout.session.completed for the REAL Starter tier link. */
async function postTierCheckout() {
  const body = {
    type: "checkout.session.completed",
    data: {
      object: {
        id: SESSION_ID,
        object: "checkout.session",
        // The branch at the plan-mapping site that no test had ever exercised.
        payment_link: STARTER_PLAN_LINK,
        // Stripe's own field: these links are monthly subscriptions.
        mode: "subscription",
        amount_total: STARTER_MONTHLY_CENTS,
        customer_details: { email: BUYER_EMAIL },
        customer_email: BUYER_EMAIL,
        subscription: "sub_test_" + TS,
        customer: "cus_test_" + TS,
      },
    },
  };
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (serverEnforcesSignatures) headers["stripe-signature"] = stripeSignature(rawBody);
  const res = await fetch(`${BASE_URL}/api/stripe/webhook`, { method: "POST", headers, body: rawBody });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

/** Non-destructive cleanup of this run's artifacts only. */
function cleanup() {
  const email = BUYER_EMAIL.toLowerCase();
  for (const path of [USERS_FILE, PURCHASES_FILE, SALES_FILE]) {
    if (!existsSync(path)) continue;
    const data = readJSONFile(path);
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    let changed = false;
    for (const key of Object.keys(data)) {
      if (key === email || key === SESSION_ID) {
        delete data[key];
        changed = true;
      }
    }
    if (changed) writeFileSync(path, JSON.stringify(data, null, 2));
  }
  if (existsSync(PENDING_FILE)) {
    const data = readJSONFile(PENDING_FILE);
    const arr = Array.isArray(data) ? data : [];
    const next = arr.filter((p: any) => !(p && p.sessionId === SESSION_ID));
    if (next.length !== arr.length) writeFileSync(PENDING_FILE, JSON.stringify(next, null, 2));
  }
}

beforeAll(async () => {
  await ensureTestServer();
  serverEnforcesSignatures = await probeSignatureEnforcement();
  cleanup();
});
afterAll(cleanup);

describe("slice 201 — a real tier link: account created, buyer email through the shared sender", () => {
  it("records the purchase and provisions the buyer's account", async () => {
    const { status } = await postTierCheckout();
    expect(status).toBe(200);

    const acct = readJSONFile(USERS_FILE)[BUYER_EMAIL.toLowerCase()];
    expect(acct, "the buyer's account was not created").toBeTruthy();
    expect(acct.source).toBe("purchase");
    expect(acct.purchased).toBe(true);
    // No password yet: the buyer sets one from the link in the email.
    expect(acct.passwordSet).toBe(false);

    const purchases = readJSONFile(PURCHASES_FILE)[BUYER_EMAIL] || [];
    const tierRow = purchases.find((p: any) => p.stripeSessionId === SESSION_ID);
    expect(tierRow, "the plan branch did not record a tier purchase").toBeTruthy();
    expect(tierRow.type).toBe("plan");
    expect(tierRow.tier).toBe(PLAN_SPECS.starter.tier);
    expect(tierRow.productName).toBe(STARTER_PRODUCT_NAME);
    expect(tierRow.amount).toBe(STARTER_MONTHLY_CENTS);
  });

  it("records the owner and buyer sends with the lane that actually answered", async () => {
    const evt = readJSONFile(SALES_FILE)[SESSION_ID];
    expect(evt, "no sale event recorded for the tier session").toBeTruthy();
    expect(evt.event.productName).toBe(STARTER_PRODUCT_NAME);
    expect(evt.event.amountCents).toBe(STARTER_MONTHLY_CENTS);

    // `notified`/`sent` are TRUE only on a provider messageId. This is the rule
    // the whole slice exists for: an attempted send is not a delivery.
    expect(typeof evt.notified).toBe("boolean");
    if (evt.notified === true) {
      expect(typeof evt.messageId).toBe("string");
      expect(evt.messageId).not.toMatch(/^mock-/);
      expect(evt.channel).not.toBe("none");
    } else {
      // Canonical run: no lane, so the sender reports a simulation, not a send.
      expect(evt.channel).toBe("none");
      expect(evt.isMock).toBe(true);
    }

    expect(evt.buyer).toBeTruthy();
    expect(evt.buyer.to).toBe(BUYER_EMAIL.toLowerCase());
    expect(typeof evt.buyer.sent).toBe("boolean");
    if (evt.buyer.sent === true) {
      expect(typeof evt.buyer.messageId).toBe("string");
      expect(evt.buyer.messageId).not.toMatch(/^mock-/);
    } else {
      expect(evt.buyer.isMock).toBe(true);
      expect(typeof evt.buyer.error).toBe("string");
    }
  });

  it("queues the undelivered buyer email with copy that says the charge is MONTHLY", async () => {
    const evt = readJSONFile(SALES_FILE)[SESSION_ID];
    const pending = readJSONFile(PENDING_FILE);
    const queued = (Array.isArray(pending) ? pending : []).filter(
      (p: any) => p && p.sessionId === SESSION_ID,
    );

    if (evt.buyer.sent === true) {
      // A real lane delivered it — nothing may be waiting in the retry lane.
      expect(queued.filter((p: any) => p.kind === "purchase-buyer")).toHaveLength(0);
      return;
    }

    const buyerMail = queued.find((p: any) => p.kind === "purchase-buyer");
    expect(buyerMail, "the undelivered buyer email was not queued").toBeTruthy();
    expect(buyerMail.sent).toBe(false);
    expect(buyerMail.to).toBe(BUYER_EMAIL.toLowerCase());

    const body = String(buyerMail.body);
    // The tier and the amount come from the system of record, not from this test.
    expect(body).toContain(`Plan: ${STARTER_PRODUCT_NAME}`);
    expect(body).toContain(`Amount paid: $${(STARTER_MONTHLY_CENTS / 100).toFixed(2)}`);
    // THE COPY DEFECT: it used to say only "Amount paid: $199.00", which reads as
    // a one-off. A monthly subscription must say it recurs, at the same amount.
    expect(body).toContain("per month");
    expect(body).toContain("renews every month");
    expect(body).toContain(`renews every month at $${(STARTER_MONTHLY_CENTS / 100).toFixed(2)}`);
    // And it must not invent a date Stripe never gave us.
    expect(body).not.toMatch(/Next payment: \d/);
  });

  it("the owner's notice was attempted through the same sender (queued when no lane)", async () => {
    const evt = readJSONFile(SALES_FILE)[SESSION_ID];
    const pending = readJSONFile(PENDING_FILE);
    const ownerMail = (Array.isArray(pending) ? pending : []).find(
      (p: any) => p && p.sessionId === SESSION_ID && p.kind === "purchase",
    );
    if (evt.notified === true) {
      expect(ownerMail).toBeUndefined();
    } else {
      expect(ownerMail, "the undelivered owner email was not queued").toBeTruthy();
      expect(ownerMail.sent).toBe(false);
      expect(String(ownerMail.body)).toContain(STARTER_PRODUCT_NAME);
    }
  });
});

// ─────────────────────────── the source guard ────────────────────────────────

/** prod-server.ts with comments stripped, so prose cannot satisfy the guard. */
function serverCode(): string {
  return readFileSync(join(REPO_ROOT, "prod-server.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("slice 201 — one sender in the codebase, and it is the shared one", () => {
  it("prod-server imports sendEmail from src/integrations/email", () => {
    const code = serverCode();
    const importLine = code.match(/import \{[^}]*\} from "\.\/src\/integrations\/email";/);
    expect(importLine, "prod-server does not import from src/integrations/email").toBeTruthy();
    expect(importLine![0]).toContain("sendEmail");
  });

  it("contains no second SendGrid call site", () => {
    expect(serverCode()).not.toContain("api.sendgrid.com");
  });

  it("no longer defines its own sender", () => {
    const code = serverCode();
    expect(code).not.toMatch(/function sendEmailSMTP\s*\(/);
    expect(code).not.toMatch(/sendEmailSMTP\s*\(/);
  });

  it("routes every former caller through the shared sender", () => {
    const code = serverCode();
    const calls = code.match(/await deliverEmail\(/g) || [];
    // The four migrated call sites: password reset, owner notice, buyer
    // confirmation, lead notification.
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it("records a send as delivered only on success + a real messageId", () => {
    const code = serverCode();
    // The one rule, in the one place: `sent` requires success, a messageId and
    // that the send was NOT a simulation.
    expect(code).toMatch(
      /const sent = result\.success === true && !!result\.messageId && result\.isMock !== true;/,
    );
  });

  it("the pending-email lane is READ, not just written", () => {
    const code = serverCode();
    expect(code).toContain('from "./src/lib/pending-email-drain"');
    expect(code).toMatch(/drainPendingEmailQueue\(\{ limit: 10 \}\)/);
  });
});
