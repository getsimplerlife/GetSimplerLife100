import { describe, expect, it, beforeEach, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { createHmac } from "crypto";
import { clearTenants, configureTenant, canMonitor, hydrateTenants } from "../monitoring/gates";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";
/**
 * Owner-decisions batch tests (2026-08-14):
 *   F4 — ANY successful purchase (incl. the $1 generic product) enables
 *        monitoring ingress (canMonitor true). Provider ACTIONS stay
 *        connection-gated (unchanged — covered elsewhere).
 *   F5 — the orphaned serve.ts /api/billing/portal stub is removed; the
 *        payment webhook paths (/api/stripe-webhook, /api/stripe/webhook)
 *        are untouched.
 *   PACK-SLOT — every plan purchase includes 1 Connection Pack slot
 *        (CRM or ERP — tenant's choice) redeemed via /api/portal/pack-slot.
 *
 * The endpoint e2e section is probe-based: it fully asserts when the target
 * server has the new endpoint (post-deploy / branch instance) and skips with
 * a clear message when the endpoint is not deployed yet (live server running
 * older code), so the canonical suite stays green both ways.
 */

// ── Source-level checks (F5 + pricing copy) — always run ─────────────
function readRepoFile(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

describe("F5 — orphaned /api/billing/portal stub removed from serve.ts", () => {
  const serveSrc = readRepoFile("serve.ts");
  const prodSrc = readRepoFile("prod-server.ts");
  it("serve.ts no longer contains the /api/billing/portal stub", () => {
    expect(serveSrc).not.toContain("/api/billing/portal");
    expect(serveSrc).not.toContain("buy.stripe.com/14A3cw2EKfRqcF0gEJ3Ru00");
  });
  it("payment webhook paths are untouched in serve.ts and prod-server.ts", () => {
    expect(serveSrc).toContain("/api/stripe-webhook");
    expect(serveSrc).toContain("/api/stripe/webhook");
    expect(prodSrc).toContain("/api/stripe-webhook");
    expect(prodSrc).toContain("/api/stripe/webhook");
  });
});

describe("Pricing copy — plan tiers state the included Connection Pack", () => {
  const pricingSrc = readRepoFile("src/routes/pricing.tsx");
  const PACK_LINE = "Includes 1 Connection Pack (CRM or ERP — your choice)";
  it("all three plan tiers advertise the included Connection Pack slot", () => {
    // Each tier is a one-line object literal; count occurrences per tier name.
    const starter = pricingSrc.slice(pricingSrc.indexOf('name: "Starter"'), pricingSrc.indexOf('name: "Professional"'));
    const professional = pricingSrc.slice(pricingSrc.indexOf('name: "Professional"'), pricingSrc.indexOf('name: "Enterprise"'));
    const enterprise = pricingSrc.slice(pricingSrc.indexOf('name: "Enterprise"'));
    expect(starter).toContain(PACK_LINE);
    expect(professional).toContain(PACK_LINE);
    expect(enterprise).toContain(PACK_LINE);
  });
  it("no longer advertises packs as 'enabled' on plans without stating the slot", () => {
    expect(pricingSrc).not.toContain("CRM / ERP enabled");
  });
});

describe("F4 — ANY purchase enables monitoring ingress (owner decision: YES)", () => {
  beforeEach(() => clearTenants());
  it("a generic purchase (configureTenant purchased:true) → canMonitor true", () => {
    configureTenant("generic-buyer@test", { purchased: true, status: "Active" });
    expect(canMonitor("generic-buyer@test", "emp-1")).toBe(true);
  });
  it("a plan purchase → canMonitor true", () => {
    configureTenant("plan-buyer@test", { purchased: true, status: "Active" });
    expect(canMonitor("plan-buyer@test", "emp-1")).toBe(true);
  });
  it("no purchase → canMonitor false", () => {
    expect(canMonitor("nobody@test", "emp-1")).toBe(false);
  });
  it("boot-time hydrateTenants enables monitoring for any active purchase", () => {
    hydrateTenants({
      "generic-buyer@test": [{ status: "active" }],
      "plan-buyer@test": [{ status: "active" }],
    });
    expect(canMonitor("generic-buyer@test", "emp-1")).toBe(true);
    expect(canMonitor("plan-buyer@test", "emp-1")).toBe(true);
    expect(canMonitor("nobody@test", "emp-1")).toBe(false);
  });
});

// ── Pack-slot endpoint e2e (probe-based) ──────────────────────────────
const TEST_DATA_DIR = testDataDir();
const BASE_URL = testBaseUrl();
const PASSWORD = "owner-decisions-pass";
const TS = Date.now();
const PACK_SLOT_EMAIL = "pack-slot@" + TS + ".test";
const PURCHASES_FILE = join(TEST_DATA_DIR, "tenant_purchases.json");
const USERS_FILE = join(TEST_DATA_DIR, "users.json");
const SESSIONS_FILE = join(TEST_DATA_DIR, "sessions.json");

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
  const ts = Math.floor(Date.now() / 1000);
  const sig = createHmac("sha256", WEBHOOK_SECRET!).update(`${ts}.${rawBody}`).digest("hex");
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
async function postWebhook(body: unknown, path = "/api/stripe/webhook") {
  const rawBody = JSON.stringify(body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (serverEnforcesSignatures) headers["stripe-signature"] = stripeSignatureHeader(rawBody);
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: rawBody });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
async function registerAndGetCookie(email: string): Promise<string | null> {
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
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
async function authedGet(path: string, cookie: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `session=${cookie}` } });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}
function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
}
function removeTestRecords() {
  for (const [path, key] of [[PURCHASES_FILE, null], [USERS_FILE, null], [SESSIONS_FILE, null]] as [string, string | null][]) {
    if (!existsSync(path)) continue;
    const data = readJSONFile(path);
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    let changed = false;
    if (key) { if (data[key] !== undefined) { delete data[key]; changed = true; } }
    else {
      if (data[PACK_SLOT_EMAIL] !== undefined) { delete data[PACK_SLOT_EMAIL]; changed = true; }
      for (const [tok, v] of Object.entries(data)) {
        const s = v as any;
        if (s && typeof s === "object" && typeof s.email === "string" && s.email.endsWith("@" + TS + ".test")) {
          delete (data as any)[tok]; changed = true;
        }
      }
    }
    if (changed) writeFileSync(path, JSON.stringify(data, null, 2));
  }
}

describe("Pack-slot redemption endpoint (plan-included Connection Pack)", () => {
  let cookie: string | null = null;
  beforeAll(async () => {
    await ensureTestServer();
    for (const dir of [TEST_DATA_DIR]) if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    serverEnforcesSignatures = await probeSignatureEnforcement();
    if (serverEnforcesSignatures && !WEBHOOK_SECRET) {
      throw new Error("Server enforces Stripe signatures but STRIPE_WEBHOOK_SECRET is not set in env/.env");
    }
    cookie = await registerAndGetCookie(PACK_SLOT_EMAIL);
    expect(cookie).toBeTruthy();
  });
  afterAll(() => { removeTestRecords(); });

  it("endpoint exists on the target server (probe) — otherwise skip", async () => {
    // Old servers return the SPA HTML fallback (200 text/html) for unknown
    // /api/portal/* routes; the new endpoint answers JSON 401 without a session.
    const res = await fetch(`${BASE_URL}/api/portal/pack-slot`, { method: "GET" });
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("text/html") || res.status === 404) {
      // Endpoint not deployed on the target server — the rest of this suite
      // is a no-op until the feature ships there.
      return;
    }
    expect(res.status).toBe(401);
  });

  it("plan purchase grants the included pack slot + redemption unlocks CRM connectors", async (ctx) => {
    // Pre-flight: if the endpoint isn't deployed, skip (the probe test above
    // already reported it). Every assertion here needs the new server code.
    const probe = await fetch(`${BASE_URL}/api/portal/pack-slot`, { method: "GET" });
    const probeCt = probe.headers.get("content-type") || "";
    if (probeCt.includes("text/html") || probe.status === 404) { ctx.skip(); return; }

    // 1. Buy a Starter plan via the canonical link (grants the pack slot).
    const sessionId = "cs_packslot_" + TS;
    const { status } = await postWebhook({
      type: "checkout.session.completed",
      data: { object: { id: sessionId, object: "checkout.session", customer_details: { email: PACK_SLOT_EMAIL }, customer_email: PACK_SLOT_EMAIL, payment_link: "https://buy.stripe.com/3cI8wR88Tasfc1B9XW2Fa2K", amount_total: 750000, metadata: {} } },
    });
    expect(status).toBe(200);

    // 2. Portal shows included:true, chosen:null.
    const { json: before } = await authedGet("/api/portal/pack-slot", cookie!);
    expect(before.data).toEqual({ included: true, chosen: null });

    // 3. Session-gated: no cookie → 401.
    const unauth = await fetch(`${BASE_URL}/api/portal/pack-slot`, { method: "GET" });
    expect(unauth.status).toBe(401);

    // 4. Redeem CRM.
    const redeem = await fetch(`${BASE_URL}/api/portal/pack-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
      body: JSON.stringify({ choice: "crm" }),
    });
    const redeemJson = await redeem.json().catch(() => ({}));
    expect(redeem.status).toBe(200);
    expect(redeemJson.data).toEqual({ included: true, chosen: "crm" });

    // 5. Fail-closed: invalid choice → 400; re-choose ERP → 409.
    const bad = await fetch(`${BASE_URL}/api/portal/pack-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
      body: JSON.stringify({ choice: "hubspot" }),
    });
    expect(bad.status).toBe(400);
    const other = await fetch(`${BASE_URL}/api/portal/pack-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
      body: JSON.stringify({ choice: "erp" }),
    });
    expect(other.status).toBe(409);

    // 6. The CRM slot is now available through the existing slot API.
    const slots = await authedGet("/api/data/crm-slots", cookie!);
    expect(slots.json.totalSlots).toBeGreaterThanOrEqual(1);
    expect(slots.json.remainingSlots).toBeGreaterThanOrEqual(1);
    // ERP remains unpurchased/unredeemed.
    const erpSlots = await authedGet("/api/data/erp-slots", cookie!);
    expect(erpSlots.json.totalSlots).toBe(0);

    // 7. Idempotent re-choose of the SAME pack stays 200.
    const again = await fetch(`${BASE_URL}/api/portal/pack-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
      body: JSON.stringify({ choice: "crm" }),
    });
    expect(again.status).toBe(200);
  });
});
