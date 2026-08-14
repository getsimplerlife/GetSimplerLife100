import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHmac } from "crypto";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

// Must match the DATA_DIR used by prod-server.ts. Defaults to <repo>/.data
// (file-backed runs); set TEST_DATA_DIR to the server's real DATA_DIR when
// verifying against the Neon-backed server (e.g. /var/lib/simplerlife100/.data)
// so the file assertions read where the server actually writes.
const PURCHASES_FILE = join(testDataDir(), "tenant_purchases.json");

// Which server to hit. Defaults to the live port-3000 prod server; set
// TEST_BASE_URL to verify against a local branch instance (e.g.
// http://localhost:3999) without touching the live server.
const BASE_URL = testBaseUrl();

const TEST_EMAIL = "e2e-provisioning@" + Date.now() + ".test";
const TEST_EMAIL_HYPHEN = "e2e-hyphen-path@" + Date.now() + ".test";

// ── Stripe signature awareness ─────────────────────────────────────
// The server verifies webhook signatures ONLY when STRIPE_WEBHOOK_SECRET is
// set in its .env. The test mirrors the server's actual enforcement:
//   * probe the server with an unsigned no-op event — 400 means it enforces
//     signatures, 200 {received:true} means it accepts unsigned payloads;
//   * when it enforces, every test POST carries a valid Stripe-style header
//     `t=<ts>,v1=HMAC-SHA256(secret, "<ts>.<rawBody>")`, and a dedicated test
//     asserts an UNSIGNED payload is rejected with no record written;
//   * when it does not enforce (secret unset — the state today), POSTs stay
//     unsigned and unsigned payloads are accepted (current behavior).
// This keeps the suite green both now and after the owner sets the secret.

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
  const signedPayload = `${ts}.${rawBody}`;
  const sig = createHmac("sha256", secret).update(signedPayload).digest("hex");
  return `t=${ts},v1=${sig}`;
}

async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  // Build the exact bytes once so the signature covers precisely what is sent.
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (serverEnforcesSignatures) headers["stripe-signature"] = stripeSignatureHeader(rawBody);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: rawBody,
  });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

/** No-op event: never enters the checkout branch, writes nothing, but a 400
 * response reveals the server rejects unsigned payloads (secret set). */
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

let serverEnforcesSignatures = false;

function readPurchases(): Record<string, any[]> {
  if (!existsSync(PURCHASES_FILE)) return {};
  return JSON.parse(readFileSync(PURCHASES_FILE, "utf-8"));
}

function removeTestEmail(email: string) {
  const p = readPurchases();
  if (p[email]) { delete p[email]; writeFileSync(PURCHASES_FILE, JSON.stringify(p, null, 2)); }
}

describe("End-to-end purchase provisioning", () => {
  beforeAll(async () => {
    await ensureTestServer();
    // Ensure the data dir exists
    const dir = join(PURCHASES_FILE, "..");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    serverEnforcesSignatures = await probeSignatureEnforcement();
    if (serverEnforcesSignatures && !WEBHOOK_SECRET) {
      throw new Error(
        "Server enforces Stripe signatures but STRIPE_WEBHOOK_SECRET is not set in env/.env — cannot sign test POSTs. " +
        "Set STRIPE_WEBHOOK_SECRET in the environment or .env to run this e2e.",
      );
    }
  });

  afterAll(() => {
    removeTestEmail(TEST_EMAIL);
    removeTestEmail(TEST_EMAIL_HYPHEN);
  });

  it("server is reachable on port 3000", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(500);
  });

  it("provisions a purchase via Stripe webhook, records it, and enables monitoring", async () => {
    // Simulate checkout.session.completed from Stripe
    const webhookBody = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_e2e_" + Date.now(),
          object: "checkout.session",
          customer_details: { email: TEST_EMAIL },
          customer_email: TEST_EMAIL,
          payment_link: "https://buy.stripe.com/test_e2e_" + Date.now(),
          amount_total: 95000,
          metadata: {},
        },
      },
    };

    const { status, json } = await post("/api/stripe/webhook", webhookBody);

    // Webhook should accept the event
    expect(status).toBe(200);
    expect(json.received).toBe(true);

    // Purchase should be recorded on disk
    const purchases = readPurchases();
    const userPurchases = purchases[TEST_EMAIL];
    expect(userPurchases).toBeDefined();
    expect(userPurchases.length).toBeGreaterThanOrEqual(1);
    expect(userPurchases[0].status).toBe("active");
    expect(userPurchases[0].amount).toBe(95000);
  });

  it("provisions a CRM Connection Pack from the canonical Stripe link with type/slots/agentType", async () => {
    // Regression for the Neon JSONB-string bug (2026-08-13): when
    // tenant_purchases.json parses to a string primitive, the pack branch
    // threw "Attempted to assign to readonly property" and nothing was
    // recorded. The boot repair must make this e2e path write a real object.
    const webhookBody = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_pack_" + Date.now(),
          object: "checkout.session",
          customer_details: { email: TEST_EMAIL },
          customer_email: TEST_EMAIL,
          payment_link: "https://buy.stripe.com/5kQaEZ60LcAn8Ppgmk2Fa2I",
          amount_total: 200000,
          metadata: {},
        },
      },
    };

    const { status, json } = await post("/api/stripe/webhook", webhookBody);
    expect(status).toBe(200);
    expect(json.received).toBe(true);

    const purchases = readPurchases();
    const userPurchases = purchases[TEST_EMAIL] || [];
    const pack = userPurchases.find((p: any) => p.type === "crm-pack");
    expect(pack).toBeDefined();
    expect(pack.slots).toBe(5);
    expect(pack.agentType).toBe("crm-pack");
    expect(pack.productName).toBe("CRM Connection Pack");
    expect(pack.status).toBe("active");
    expect(pack.amount).toBe(200000);
  });

  it("provisions a purchase via the hyphenated /api/stripe-webhook path (Stripe dashboard spelling)", async () => {
    // Live bug (2026-08-13): the Stripe dashboard webhook is registered at
    // /api/stripe-webhook (hyphen), but prod-server only matched the slash
    // form — events fell through to the SPA HTML fallback (200), so Stripe
    // marked them delivered while NO purchase was recorded. The fix accepts
    // BOTH spellings; this test proves the hyphen path provisions a pack.
    const webhookBody = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_hyphen_" + Date.now(),
          object: "checkout.session",
          customer_details: { email: TEST_EMAIL_HYPHEN },
          customer_email: TEST_EMAIL_HYPHEN,
          payment_link: "https://buy.stripe.com/5kQaEZ60LcAn8Ppgmk2Fa2I",
          amount_total: 200000,
          metadata: {},
        },
      },
    };

    const { status, json } = await post("/api/stripe-webhook", webhookBody);
    expect(status).toBe(200);
    expect(json.received).toBe(true);

    const purchases = readPurchases();
    const pack = (purchases[TEST_EMAIL_HYPHEN] || []).find((p: any) => p.type === "crm-pack");
    expect(pack).toBeDefined();
    expect(pack.slots).toBe(5);
    expect(pack.agentType).toBe("crm-pack");
    expect(pack.status).toBe("active");
    expect(pack.amount).toBe(200000);
  });

  it("GET on both webhook paths never returns the SPA HTML fallback", async () => {
    // The pre-fix bug served the SPA HTML page (200 text/html) for GET
    // /api/stripe-webhook — a non-POST on a webhook path must fail closed
    // with a non-HTML response instead of masquerading as a delivered event.
    for (const p of ["/api/stripe-webhook", "/api/stripe/webhook"]) {
      const res = await fetch(`${BASE_URL}${p}`);
      const ct = res.headers.get("content-type") || "";
      expect(ct).not.toContain("text/html");
    }
  });

  it("rejects an unsigned payload when the server enforces Stripe signatures (no record written)", async (ctx) => {
    // Only meaningful when STRIPE_WEBHOOK_SECRET is set on the server — when
    // it is absent, unsigned payloads are accepted by design (covered by the
    // POST tests above).
    if (!serverEnforcesSignatures) { ctx.skip(); return; }

    const unsignedEmail = "e2e-unsigned@" + Date.now() + ".test";
    const webhookBody = {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_unsigned_" + Date.now(),
          object: "checkout.session",
          customer_details: { email: unsignedEmail },
          customer_email: unsignedEmail,
          payment_link: "https://buy.stripe.com/test_unsigned_" + Date.now(),
          amount_total: 1000,
          metadata: {},
        },
      },
    };

    // Deliberately no stripe-signature header.
    const res = await fetch(`${BASE_URL}/api/stripe/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookBody),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // No purchase record may exist for the rejected email.
    const purchases = readPurchases();
    expect(purchases[unsignedEmail]).toBeUndefined();
  });

  it("entitled tenant is accepted at monitoring webhook after purchase", async () => {
    const { json } = await post("/api/monitoring/webhook/hubspot", {
      employeeId: "emp-invoice-ledger-ai",
      eventType: "invoice.created",
      tenantId: TEST_EMAIL,
      payload: { invoice: "post-purchase-test" },
    });

    expect(json.status).toBe("processed");
    expect(json.dispatchedTo).toBe("emp-invoice-ledger-ai");
  });

  it("duplicate events are skipped", async () => {
    const eventId = "e2e-dup-" + Date.now();

    const { json: first } = await post("/api/monitoring/webhook/hubspot", {
      id: eventId,
      employeeId: "emp-invoice-ledger-ai",
      eventType: "invoice.created",
      tenantId: TEST_EMAIL,
      payload: { invoice: "dup-1" },
    });
    expect(first.status).toBe("processed");

    const { json: second } = await post("/api/monitoring/webhook/hubspot", {
      id: eventId,
      employeeId: "emp-invoice-ledger-ai",
      eventType: "invoice.created",
      tenantId: TEST_EMAIL,
      payload: { invoice: "dup-2" },
    });
    expect(second.status).toBe("skipped");
    expect(second.reason).toBe("Duplicate event");
  });
});
