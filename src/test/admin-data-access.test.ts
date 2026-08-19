import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

/**
 * SECURITY (2026-08-19): admin DATA endpoints must be OWNER-ONLY.
 *
 * Two real gaps were closed in prod-server.ts:
 *  1. The DEDICATED /api/data/users handler was auth-only — ANY registered
 *     customer could read EVERY registered user (email/role/createdAt).
 *     It now requires user.email === "mathewortiz97@gmail.com" (403 otherwise).
 *  2. The GENERIC /api/data/* fallback accepted any authenticated user for
 *     admin-ish subpaths (users/credentials/health/datadir + credentials/<id>
 *     PUT/DELETE). It now fail-closes with the same 403 before any handler.
 *
 * Customer-facing subpaths (analytics/marketplace/employees/billing) stay open
 * to any authenticated customer. This file proves the 403/200 split end-to-end.
 *
 * NOTE on the owner session: the shared self-hosted test server may already
 * contain mathewortiz97@gmail.com registered by another suite (with a password
 * we don't know), so we CANNOT register/login the owner. Instead we seed a
 * session token directly into sessions.json + users.json (the server reads both
 * files fresh on every request — getUserFromSession), which is deterministic.
 */
const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const PASSWORD = "admin-data-access-pass";
const TS = Date.now();
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "owner-session-" + TS;
const CUSTOMER_EMAIL = "customer-" + TS + "@example.test";

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

function readJSONFile(path: string): any {
  if (!existsSync(path)) return {};
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return {}; }
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

async function authedGet(path: string, cookie: string) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { Cookie: `session=${cookie}` } });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

async function authedSend(path: string, cookie: string, method: string, body?: unknown) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

/** Remove only this run's trace: the customer user/session + our owner token. */
function removeTestRecords() {
  for (const file of ["users.json", "sessions.json"]) {
    const path = join(TEST_DATA_DIR, file);
    if (!existsSync(path)) continue;
    try {
      const data = readJSONFile(path);
      if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
      let changed = false;
      for (const [tok, v] of Object.entries(data)) {
        const s = v as any;
        const email =
          typeof s === "string" ? s : (s && typeof s === "object" ? s.email : undefined);
        if (typeof email === "string" && email.endsWith("@" + TS + ".example.test")) {
          delete (data as any)[tok];
          changed = true;
        }
        if (tok === OWNER_TOKEN) {
          delete (data as any)[tok];
          changed = true;
        }
      }
      if (changed) writeFileSync(path, JSON.stringify(data, null, 2));
    } catch { /* leave as-is */ }
  }
}

describe("SECURITY: admin data endpoints are owner-only", () => {
  let ownerCookie: string | null = null;
  let customerCookie: string | null = null;

  beforeAll(async () => {
    await ensureTestServer();
    if (!existsSync(TEST_DATA_DIR)) mkdirSync(TEST_DATA_DIR, { recursive: true });
    ownerCookie = seedOwnerSession();
    customerCookie = await registerAndGetCookie(CUSTOMER_EMAIL);
    expect(ownerCookie).toBeTruthy();
    expect(customerCookie).toBeTruthy();
  });

  afterAll(() => { removeTestRecords(); });

  it("unauthenticated request still gets 401 (no regression)", async () => {
    const res = await fetch(`${BASE_URL}/api/data/users`);
    expect(res.status).toBe(401);
  });

  it("non-owner gets 403 on /api/data/users (cross-tenant user list)", async () => {
    const res = await authedGet("/api/data/users", customerCookie!);
    expect(res.status).toBe(403);
    expect(res.json?.error).toBe("Admin access required");
  });

  it("owner gets 200 + user list on /api/data/users", async () => {
    const res = await authedGet("/api/data/users", ownerCookie!);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json?.data)).toBe(true);
  });

  it("non-owner gets 403 on /api/data/credentials (credential metadata)", async () => {
    const res = await authedGet("/api/data/credentials", customerCookie!);
    expect(res.status).toBe(403);
  });

  it("non-owner gets 403 on PUT /api/data/credentials/<id> (mutation blocked)", async () => {
    const res = await authedSend("/api/data/credentials/xero", customerCookie!, "PUT", { clientId: "evil-client" });
    expect(res.status).toBe(403);
  });

  it("non-owner gets 403 on DELETE /api/data/credentials/<id> (deletion blocked)", async () => {
    const res = await authedSend("/api/data/credentials/xero", customerCookie!, "DELETE");
    expect(res.status).toBe(403);
  });

  it("non-owner gets 403 on /api/data/health and /api/data/datadir (server internals)", async () => {
    expect((await authedGet("/api/data/health", customerCookie!)).status).toBe(403);
    expect((await authedGet("/api/data/datadir", customerCookie!)).status).toBe(403);
  });

  it("owner gets 200 on /api/admin/health (admin health page data source)", async () => {
    const res = await authedGet("/api/admin/health", ownerCookie!);
    expect(res.status).toBe(200);
    expect(typeof res.json?.uptime).toBe("number");
  });

  it("owner gets 200 on /api/admin/credentials (bare array used by the admin page)", async () => {
    const res = await authedGet("/api/admin/credentials", ownerCookie!);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json)).toBe(true);
  });

  it("non-owner gets 403 on /api/admin/credentials (existing /api/admin gate holds)", async () => {
    const res = await authedGet("/api/admin/credentials", customerCookie!);
    expect(res.status).toBe(403);
  });

  it("customer-facing /api/data/marketplace stays open for non-owners", async () => {
    const res = await authedGet("/api/data/marketplace", customerCookie!);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.json?.data)).toBe(true);
  });
});
