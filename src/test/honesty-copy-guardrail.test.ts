/**
 * honesty-copy-guardrail.test.ts — P1-2 authenticity copy sweep guardrails.
 *
 * Two layers:
 *  1. LIVE (self-hosted test server): /api/data/payment-method must return ONLY
 *     the caller's own durable rows (tenant_payment_methods.json) or honest
 *     null — it must NEVER fabricate a "Visa 4242" card again, the owner gets
 *     no special-case card, strangers see null, and anonymous callers are
 *     fail-closed 401.
 *  2. STATIC: user-facing portal/server sources must not reintroduce fabricated
 *     outcomes — fake payment cards, audit-inferred "active" plans, dead
 *     "Response sent successfully!" claims, security-theater header copy, fake
 *     admin rows/numbers, the orphan "AI Model Training" surface, or analytics
 *     refresh theater.
 *
 * Isolation: writes only our own email/token rows + tenant_payment_methods.json;
 * every touched file is snapshot/restored in afterAll.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const P = (rel: string) => join(process.cwd(), rel);

const TS = Date.now();
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "honesty-owner-session-" + TS;
const STRANGER_EMAIL = `stranger-${TS}@example.com`;

function readJSONFile(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}
function writeJSONFile(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data, null, 2));
}

const TRACKED = ["users.json", "sessions.json", "tenant_payment_methods.json"];
const originals = new Map<string, { existed: boolean; data: any }>();
function snapshotAll() {
  for (const f of TRACKED) {
    const p = join(TEST_DATA_DIR, f);
    originals.set(f, { existed: existsSync(p), data: existsSync(p) ? readJSONFile(p) : null });
  }
}
function restoreAll() {
  for (const f of TRACKED) {
    const p = join(TEST_DATA_DIR, f);
    const orig = originals.get(f);
    if (!orig) continue;
    if (!orig.existed) {
      try { (require("fs") as typeof import("fs")).rmSync(p, { force: true }); } catch { /* noop */ }
    } else {
      writeJSONFile(p, orig.data);
    }
  }
}

// A REAL durable row for the owner — the endpoint must return exactly this and
// nothing fabricated on top of it.
const REAL_CARD = { brand: "Amex", last4: "0002", isDefault: true, source: "durable" };

function seedOwner() {
  const usersFile = join(TEST_DATA_DIR, "users.json");
  const users = readJSONFile(usersFile);
  if (!users[OWNER_EMAIL]) users[OWNER_EMAIL] = { email: OWNER_EMAIL, role: "admin", createdAt: Date.now() };
  writeJSONFile(usersFile, users);
  const sessionsFile = join(TEST_DATA_DIR, "sessions.json");
  const sessions = readJSONFile(sessionsFile);
  sessions[OWNER_TOKEN] = { email: OWNER_EMAIL, createdAt: Date.now() };
  writeJSONFile(sessionsFile, sessions);
}

async function registerCookie(email: string): Promise<string | null> {
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "honesty-test-pass" }),
    redirect: "manual",
  });
  let setCookie = reg.headers.get("set-cookie") || "";
  if (!setCookie && reg.status === 409) {
    const login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "honesty-test-pass" }),
    });
    setCookie = login.headers.get("set-cookie") || "";
  }
  const m = setCookie.match(/session=([^;]+)/);
  return m ? m[1] : null;
}

async function authedGet(path: string, cookie: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `session=${cookie}` } });
  let json: any; try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

beforeAll(async () => {
  await ensureTestServer();
  snapshotAll();
  seedOwner();
  // Real durable card rows keyed by email (structural per-tenant store).
  const pmFile = join(TEST_DATA_DIR, "tenant_payment_methods.json");
  writeJSONFile(pmFile, { [OWNER_EMAIL]: [REAL_CARD] });
});

afterAll(() => {
  restoreAll();
});

describe("P1-2: payment-method endpoint never fabricates a card", () => {
  it("prod-server.ts contains no VISA-4242 fabrication", () => {
    const server = readFileSync(P("prod-server.ts"), "utf8");
    expect(server).not.toMatch(/4242/);
    expect(server).not.toMatch(/brand: "Visa"/);
    expect(server).not.toMatch(/Seed payment method data/);
  });

  it("owner gets ONLY their own durable row — never a hardcoded Visa", async () => {
    const { status, json } = await authedGet("/api/data/payment-method", OWNER_TOKEN);
    expect(status).toBe(200);
    expect(json.data).toEqual(REAL_CARD);
    expect(json.data.brand).not.toBe("Visa");
    expect(json.data.last4).not.toBe("4242");
  });

  it("stranger tenant sees honest null (per-tenant isolation)", async () => {
    const cookie = await registerCookie(STRANGER_EMAIL);
    expect(cookie).toBeTruthy();
    const { status, json } = await authedGet("/api/data/payment-method", cookie as string);
    expect(status).toBe(200);
    expect(json.data).toBe(null);
  });

  it("anonymous caller is fail-closed 401", async () => {
    const res = await fetch(`${BASE_URL}/api/data/payment-method`);
    expect(res.status).toBe(401);
  });
});

describe("P1-2: honest-outcome copy guardrails", () => {
  it("settings billing reads the native billing view, not fabricated plan/PM data", () => {
    const s = readFileSync(P("src/lazy/portal.settings.index.page.tsx"), "utf8");
    expect(s).not.toContain("/api/data/payment-method");
    expect(s).not.toContain("Core access with running automations");
    expect(s).not.toContain('{activePlan || "Free"}');
    expect(s).not.toContain("custom platform package is active and deployed");
    expect(s).not.toContain("Active systems operating standards");
    expect(s).toContain("/api/native/billing");
  });

  it("tasks page stops claiming actions it cannot execute", () => {
    const t = readFileSync(P("src/lazy/portal.tasks.index.page.tsx"), "utf8");
    expect(t).not.toMatch(/completed for Task/);
    expect(t).not.toContain("download execution transcripts, and override holds");
  });

  it("inbox page stops claiming replies were sent or state persisted", () => {
    const i = readFileSync(P("src/lazy/portal.inbox.index.page.tsx"), "utf8");
    expect(i).not.toContain("Response sent successfully!");
    expect(i).not.toContain("RAG Context Matrix");
    expect(i).not.toMatch(/Item is now marked as/);
  });

  it("portal header no longer claims a security layer", () => {
    const p = readFileSync(P("src/lazy/portal.page.tsx"), "utf8");
    expect(p).not.toContain("RUNNING UNDER SECURITY LAYER");
  });

  it("admin pages render real data only (no demo rows, no fake KPIs)", () => {
    const u = readFileSync(P("src/lazy/portal.admin.users.page.tsx"), "utf8");
    expect(u).not.toContain("mathewortiz97@gmail.com");
    expect(u).not.toContain("demo@test.com");
    expect(u).not.toContain("2026-07-21");
    const a = readFileSync(P("src/lazy/portal.admin.analytics.page.tsx"), "utf8");
    expect(a).not.toContain("342K");
    expect(a).not.toContain("pct: 45");
    expect(a).not.toContain("totalCalls");
  });

  it("orphan AI Model Training surface is gone", () => {
    expect(existsSync(P("src/routes/portal.training.index.tsx"))).toBe(false);
    expect(existsSync(P("src/lazy/portal.training.index.page.tsx"))).toBe(false);
  });

  it("analytics refresh is honest (refetches; no theater POST claim)", () => {
    const an = readFileSync(P("src/lazy/portal.analytics.index.page.tsx"), "utf8");
    expect(an).not.toContain("analytics_");
    expect(an).not.toContain("Success: Performance data refreshed");
    expect(an).toContain("await loadAnalytics()");
  });
});