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
 *   PACK-SLOT — RETIRED (owner 10-21) and the /api/portal/pack-slot route was
 *        DELETED from the server in the 10-30 retired-product cleanup. The
 *        e2e section below now pins the retirement: the route serves no
 *        entitlement and a retired pack link provisions no pack record.
 */

// ── Source-level checks (F5 + pricing copy) — always run ─────────────
function readRepoFile(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

describe("F5 — dead serve.ts removed entirely (owner-approved I5)", () => {
  const prodSrc = readRepoFile("prod-server.ts");
  it("serve.ts no longer exists in the repo", () => {
    expect(existsSync(join(process.cwd(), "serve.ts"))).toBe(false);
  });
  it("prod-server.ts is the only server and keeps both payment webhook paths", () => {
    expect(prodSrc).toContain("/api/stripe-webhook");
    expect(prodSrc).toContain("/api/stripe/webhook");
  });
  it("no file imports serve.ts", () => {
    // Any lingering importer would have broken the build; assert none reference it.
    const { execSync } = require("child_process");
    const hits = execSync(`grep -rn "from \\"./serve\\"\\|from '\\./serve'\\|serve\\.ts" --include="*.ts" --include="*.tsx" --include="*.js" --exclude="owner-decisions.test.ts" --exclude="documentProcessor.ts" src package.json 2>/dev/null || true`, { encoding: "utf-8" });
    expect(hits.trim()).toBe("");
  });
});

describe("Pricing copy — LOCKED platform tiers (owner 09-27)", () => {
  const pricingSrc = readRepoFile("src/routes/pricing.tsx");
  it("lists the three locked platform tiers (Starter/Growth/Enterprise) — no per-employee model", () => {
    const starter = pricingSrc.slice(pricingSrc.indexOf('name: "Starter"'), pricingSrc.indexOf('name: "Growth"'));
    const growth = pricingSrc.slice(pricingSrc.indexOf('name: "Growth"'), pricingSrc.indexOf('name: "Enterprise"'));
    const enterprise = pricingSrc.slice(pricingSrc.indexOf('name: "Enterprise"'));
    expect(starter).toContain("monthly: 199");
    expect(growth).toContain("monthly: 599");
    expect(enterprise).toContain("monthly: 1499");
    // Every tier is 100% of the native capability layer — no per-employee fees.
    expect(pricingSrc).toContain("100% of native capabilities");
    expect(pricingSrc).not.toMatch(/per AI employee|AI employees? included/);
  });
  it("connection-pack slot language is fully retired — zero pack-slot mentions (owner 10-21)", () => {
    expect(pricingSrc).not.toMatch(/connection pack/i);
    expect(pricingSrc).not.toMatch(/pack-slot|pack slot/i);
    expect(pricingSrc).not.toMatch(/CRM \/ ERP enabled/);
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

describe("Connection Pack slot is RETIRED — route deleted, no entitlement served", () => {
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

  it("GET /api/portal/pack-slot serves NO entitlement payload (route deleted)", async () => {
    // The handler is gone from prod-server.ts, so this path falls through to
    // the documented unmatched-/api fallback. What must NEVER happen is a JSON
    // entitlement body — that was the retired product's surface.
    const res = await fetch(`${BASE_URL}/api/portal/pack-slot`, {
      method: "GET",
      headers: { Cookie: `session=${cookie}` },
    });
    const ct = res.headers.get("content-type") || "";
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    expect(json?.data?.included).toBeUndefined();
    expect(json?.data?.chosen).toBeUndefined();
    expect(ct.includes("text/html") || res.status === 404 || res.status === 401).toBe(true);
  });

  it("POST /api/portal/pack-slot redeems nothing", async () => {
    const res = await fetch(`${BASE_URL}/api/portal/pack-slot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
      body: JSON.stringify({ choice: "crm" }),
    });
    const ct = res.headers.get("content-type") || "";
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    expect(json?.data?.chosen).toBeUndefined();
    expect(ct.includes("text/html") || res.status === 404 || res.status === 401 || res.status === 405).toBe(true);
  });

  it("a retired pack link no longer provisions a pack record or slot grant", async () => {
    // Neither pack payment link exists in the live Stripe account (verified
    // 10-30), and the webhook no longer maps them. The checkout records
    // through the generic branch: amount-only, no type, no slots.
    const sessionId = "cs_packslot_retired_" + TS;
    const { status } = await postWebhook({
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          object: "checkout.session",
          customer_details: { email: PACK_SLOT_EMAIL },
          customer_email: PACK_SLOT_EMAIL,
          payment_link: "https://buy.stripe.com/5kQaEZ60LcAn8Ppgmk2Fa2I",
          amount_total: 200000,
          metadata: {},
        },
      },
    });
    expect(status).toBe(200);
    const purchases = readJSONFile(PURCHASES_FILE);
    const recs = purchases[PACK_SLOT_EMAIL] || [];
    expect(recs.length).toBe(1);
    expect(recs[0].type).toBeUndefined();
    expect(recs[0].slots).toBeUndefined();
    const slots = await authedGet("/api/data/crm-slots", cookie!);
    expect(slots.status).toBe(200);
    expect(slots.json.totalSlots).toBe(0);
  });
});
