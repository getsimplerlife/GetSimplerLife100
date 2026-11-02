/**
 * SLICE 180 — the server side of the five C6 §4 defects
 * (qa-sweepC6-s4-settled-2026-11-02.md).
 *
 *  A3  `/api/purchases` answers only the CALLER'S OWN rows, keyed by map and
 *      carrying `purchasedAt` (never `createdAt`, never a `userId`). The admin
 *      page bucketed them by `a.userId`, so every client showed "No purchases
 *      yet" while "Total Purchases" was non-zero. This pins the replacement:
 *      an OWNER-GATED all-tenant read at `/api/admin/purchases`, behind the
 *      same 401/403 gate `/api/admin/users` uses, with `tenantEmail` attached
 *      and each row's own `purchasedAt` untouched.
 *
 *  §1.4 `/api/admin/backup` ran `runBackupSnapshot()` for ANY verb, with no
 *      same-origin check: a GET — a navigation, a link click, a prefetch
 *      carrying the SameSite=Lax session cookie — performed a durable-store
 *      write. It is POST-only + same-origin now, like its sibling
 *      `data-health/backup`.
 *
 *  B3  `/api/admin/health` answered the literal `status: "healthy"`. It is now
 *      DERIVED from the filesystem report behind `/api/admin/data-health`, and
 *      `checks` carries the evidence. A status may never claim a measurement
 *      nobody performed.
 *
 * Runs against the self-hosted test server (same harness as
 * admin-data-access.test.ts: seed an owner session token directly, register a
 * real customer, and make real authed HTTP requests).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const REPO = existsSync(join(process.cwd(), "prod-server.ts"))
  ? process.cwd()
  : join(process.cwd(), "..", "..");
const TS = Date.now();
const PASSWORD = "slice-180-pass";
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "slice180-owner-" + TS;
const CUSTOMER_EMAIL = "slice180-customer-" + TS + "@example.test";
const TENANT_EMAIL = "slice180-tenant-" + TS + "@example.test";

/** A purchase record in the exact shape `buildPlanPurchase` writes. */
const PURCHASE = {
  id: "purchase-slice180",
  type: "plan",
  tier: "growth",
  productName: "Growth plan",
  amount: 59900,
  stripeSessionId: "cs_test_slice180",
  status: "active",
  purchasedAt: "2026-11-02T07:15:00.000Z",
};

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
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

/** Ensure the owner user exists and seed a fresh session token for it. */
function seedOwnerSession(): string {
  const usersFile = join(TEST_DATA_DIR, "users.json");
  const sessionsFile = join(TEST_DATA_DIR, "sessions.json");
  const users = readJSONFile(usersFile);
  if (!users[OWNER_EMAIL]) {
    users[OWNER_EMAIL] = { email: OWNER_EMAIL, role: "admin", createdAt: Date.now() };
  }
  writeFileSync(usersFile, JSON.stringify(users, null, 2));
  const sessions = readJSONFile(sessionsFile);
  sessions[OWNER_TOKEN] = { email: OWNER_EMAIL, createdAt: Date.now() };
  writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
  return OWNER_TOKEN;
}

/** A purchase belonging to a DIFFERENT tenant than the caller. */
function seedPurchase(): void {
  const file = join(TEST_DATA_DIR, "tenant_purchases.json");
  const store = readJSONFile(file);
  store[TENANT_EMAIL] = [PURCHASE];
  writeFileSync(file, JSON.stringify(store, null, 2));
}

async function authedGet(path: string, cookie: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `session=${cookie}` } });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json, headers: res.headers };
}

async function authedSend(path: string, cookie: string, method: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `session=${cookie}`, ...headers },
  });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

beforeAll(async () => {
  await ensureTestServer();
  if (!existsSync(TEST_DATA_DIR)) mkdirSync(TEST_DATA_DIR, { recursive: true });
  seedPurchase();
});

afterAll(() => {
  // Remove only this run's trace: the seeded purchase bucket, our owner token
  // and the session/user rows for our throwaway customer.
  const purchasesFile = join(TEST_DATA_DIR, "tenant_purchases.json");
  if (existsSync(purchasesFile)) {
    const store = readJSONFile(purchasesFile);
    if (store && typeof store === "object" && TENANT_EMAIL in store) {
      delete store[TENANT_EMAIL];
      writeFileSync(purchasesFile, JSON.stringify(store, null, 2));
    }
  }
  for (const file of ["sessions.json", "users.json"]) {
    const path = join(TEST_DATA_DIR, file);
    if (!existsSync(path)) continue;
    const data = readJSONFile(path);
    if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
    let changed = false;
    for (const key of Object.keys(data)) {
      const row = data[key] as any;
      const email = typeof row === "string" ? row : row && typeof row === "object" ? row.email : undefined;
      if (key === OWNER_TOKEN || key === CUSTOMER_EMAIL || (typeof email === "string" && email === CUSTOMER_EMAIL)) {
        delete data[key];
        changed = true;
      }
    }
    if (changed) writeFileSync(path, JSON.stringify(data, null, 2));
  }
});

describe("slice 180 — /api/admin/purchases is the owner-gated all-tenant read", () => {
  let ownerCookie = "";
  let customerCookie = "";

  beforeAll(async () => {
    ownerCookie = seedOwnerSession();
    customerCookie = (await registerAndGetCookie(CUSTOMER_EMAIL)) || "";
    expect(ownerCookie).toBeTruthy();
    expect(customerCookie).toBeTruthy();
  });

  it("answers 401 to an unauthenticated caller", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/purchases`);
    expect(res.status).toBe(401);
  });

  it("answers 403 to a non-owner — the same gate /api/admin/users uses", async () => {
    const res = await authedGet("/api/admin/purchases", customerCookie);
    expect(res.status).toBe(403);
    expect(res.json?.error).toBe("Admin access required");
  });

  it("a tenant cannot reach another tenant's purchases through /api/purchases", async () => {
    // The tenant-scoped route the page used to read: still own-rows-only.
    const res = await authedGet("/api/purchases", customerCookie);
    expect(res.status).toBe(200);
    expect(res.json?.data).toEqual([]);
    const own = (res.json?.data || []) as any[];
    expect(own.some((r) => r?.id === PURCHASE.id)).toBe(false);
  });

  it("gives the owner every tenant's rows, with the owning tenant's email attached", async () => {
    const res = await authedGet("/api/admin/purchases", ownerCookie);
    expect(res.status).toBe(200);
    const rows = (res.json?.data || []) as any[];
    const row = rows.find((r) => r?.id === PURCHASE.id);
    expect(row, "the seeded purchase must be visible to the owner").toBeTruthy();
    expect(row.tenantEmail).toBe(TENANT_EMAIL);
    // The row's own fields are untouched — `purchasedAt`, never a `createdAt`
    // the record does not carry.
    expect(row.purchasedAt).toBe(PURCHASE.purchasedAt);
    expect(row.createdAt).toBeUndefined();
    expect(row.userId).toBeUndefined();
  });

  it("is a read route: POST is a 405 with an Allow header", async () => {
    const res = await authedSend("/api/admin/purchases", ownerCookie, "POST");
    expect(res.status).toBe(405);
    expect((res.json?.allow || "").toUpperCase()).toContain("GET");
  });
});

describe("slice 180 — /api/admin/backup is POST-only and same-origin", () => {
  let ownerCookie = "";

  beforeAll(() => {
    ownerCookie = seedOwnerSession();
  });

  it("refuses a GET with 405 and runs no snapshot", async () => {
    const res = await authedGet("/api/admin/backup", ownerCookie);
    expect(res.status, "a GET must never perform the write").toBe(405);
    expect(res.json?.error).toBe("Method not allowed");
    // The mutation's own result shape must be absent: no snapshot ran.
    expect(res.json?.success).toBeUndefined();
    expect(res.json?.completedAt).toBeUndefined();
  });

  it("refuses a cross-origin POST with 403 and runs no snapshot", async () => {
    const res = await authedSend("/api/admin/backup", ownerCookie, "POST", { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(String(res.json?.error || "")).toMatch(/cross-origin/i);
    expect(res.json?.success).toBeUndefined();
  });

  it("still reaches the real snapshot flow for a same-origin POST", async () => {
    // No Origin header = a non-browser request (same-origin.ts allows it); this
    // proves the guard did not break the page's own button.
    const res = await authedSend("/api/admin/backup", ownerCookie, "POST");
    expect(res.status).toBe(200);
    expect(typeof res.json?.success).toBe("boolean");
    expect(typeof res.json?.completedAt).toBe("string");
  });

  it("the method guard and the origin check both precede the write in the source", () => {
    // A live probe cannot observe "no snapshot ran" in the file-backed test
    // environment (the durable store is disabled there), so the ORDER that
    // makes a GET harmless is pinned at the source.
    const src = readFileSync(join(REPO, "prod-server.ts"), "utf8");
    const start = src.indexOf('if (subPath === "backup") {');
    const end = src.indexOf('if (subPath === "health") {');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    const methodGuard = block.indexOf('req.method !== "POST"');
    const originCheck = block.indexOf("checkRequestSameOrigin(");
    // The real call is `await runBackupSnapshot();`. A bare `runBackupSnapshot()`
    // ALSO matches the SLICE 180 comment that explains this very fix, which
    // would place the "write" above the guards and make the ordering assertion
    // vacuous. Match the call, not the prose about the call.
    const write = block.indexOf("await runBackupSnapshot()");
    expect(methodGuard, "the backup route must check the verb").toBeGreaterThan(-1);
    expect(originCheck, "the backup route must check the origin").toBeGreaterThan(methodGuard);
    expect(write, "the write must come after both guards").toBeGreaterThan(originCheck);
  });
});

describe("slice 180 — /api/admin/health reports a measurement, never a literal", () => {
  let ownerCookie = "";

  beforeAll(() => {
    ownerCookie = seedOwnerSession();
  });

  it("derives `status` from the checks it actually measured", async () => {
    const res = await authedGet("/api/admin/health", ownerCookie);
    expect(res.status).toBe(200);
    const body = res.json;
    expect(Array.isArray(body?.checks)).toBe(true);
    expect(body.checks.length, "a health verdict must be backed by at least one check").toBeGreaterThan(0);
    for (const c of body.checks) {
      expect(["ok", "degraded", "unknown"]).toContain(c.status);
    }
    // The system of record is the server's own check list: the summary may not
    // disagree with it, and it may never be the old literal.
    const expected = body.checks.some((c: any) => c.status === "degraded")
      ? "degraded"
      : body.checks.every((c: any) => c.status === "ok")
        ? "ok"
        : "unknown";
    expect(body.status).toBe(expected);
    expect(body.status).not.toBe("healthy");
    expect(typeof body.measuredAt).toBe("string");
  });

  it("keeps the real uptime and memory telemetry", async () => {
    const res = await authedGet("/api/admin/health", ownerCookie);
    expect(typeof res.json?.uptime).toBe("number");
    expect(typeof res.json?.memory?.rss).toBe("number");
  });

  it("answers 403 to a non-owner (the gate is unchanged)", async () => {
    const customer = await registerAndGetCookie(CUSTOMER_EMAIL);
    const res = await authedGet("/api/admin/health", customer || "");
    expect([401, 403]).toContain(res.status);
  });
});
