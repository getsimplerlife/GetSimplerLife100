import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

/**
 * slice-184-door-and-writes.test.ts — two small high-integrity fixes.
 *
 * ITEM 1 — the unauthenticated monitoring door.
 * `POST /api/monitoring/webhook/:providerId` used to fall through to a
 * "generic provider" branch for ANY provider id: no signature, no credential,
 * a homegrown body shape ({id?, employeeId, eventType, tenantId, payload})
 * straight into dispatch(). Only two signed receivers exist (xero,
 * slack/slack-events). The generic branch is REMOVED; every other provider id
 * answers 404 JSON. These tests are wire-level on purpose: they import nothing
 * from the slice, so the same file run against the previous commit fails.
 *
 * ITEM 2 — two endpoints that answered {success:true} and wrote nothing.
 *   /api/data/reports  → now WRITES: tenant_reports.json is a registered
 *                        durable store and the GET below (plus /portal/reports)
 *                        is a real read path, so the write is proven end to end
 *                        through the read path AND through the store on disk.
 *   /api/data/training → now answers honestly (501): nothing in the product
 *                        renders a training record, so writing rows no screen
 *                        could show would invent a surface this slice is not
 *                        about.
 *
 * Every assertion below derives from the system of record (the HTTP response,
 * the read path, or the JSON file the server wrote) — never from a literal the
 * component hands back.
 */

const BASE_URL = testBaseUrl();
const DATA_DIR = testDataDir();
const REPORTS_FILE = join(DATA_DIR, "tenant_reports.json");
const TRAINING_FILE = join(DATA_DIR, "tenant_training.json");

const TS = Date.now();
const PASSWORD = "slice-184-pass";
const OWNER_EMAIL = `slice184-owner@${TS}.test`;
const OTHER_EMAIL = `slice184-other@${TS}.test`;

function readStore(path: string): any {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return null; }
}

async function register(email: string): Promise<string> {
  const reg = await fetch(`${BASE_URL}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
    redirect: "manual",
  });
  let setCookie = reg.headers.get("set-cookie") || "";
  if (!setCookie) {
    const login = await fetch(`${BASE_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    setCookie = login.headers.get("set-cookie") || "";
  }
  const m = setCookie.match(/session=([^;]+)/);
  if (!m) throw new Error(`could not obtain a session for ${email} (register ${reg.status})`);
  return m[1];
}

async function authedJson(
  method: "GET" | "POST",
  path: string,
  cookie: string,
  body?: unknown,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `session=${cookie}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

async function anonymousPost(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
}

// The exact shape the removed generic branch accepted. Any provider id worked;
// these are the two the old comment named plus one that never had a receiver.
const GENERIC_BODY = {
  employeeId: "emp-invoice-ledger-ai",
  eventType: "invoice.created",
  payload: { invoice: "slice-184" },
};

describe("Slice 184 — the monitoring webhook door", () => {
  beforeAll(async () => { await ensureTestServer(); }, 60_000);
  afterAll(() => { /* the test-env watchdog tears the server down */ });

  it("refuses an anonymous POST for a provider id with no signed receiver", async () => {
    for (const providerId of ["hubspot", "zendesk", "not-a-provider"]) {
      const { status, json } = await anonymousPost(`/api/monitoring/webhook/${providerId}`, {
        ...GENERIC_BODY,
        tenantId: OWNER_EMAIL,
      });
      // The retired branch reached dispatch() and answered 200/400/409 with an
      // EventOutcome. The door is closed: no outcome shape, no 2xx.
      expect(status, `${providerId} must be refused`).toBe(404);
      expect(json?.error, `${providerId} must say why`).toBeTruthy();
      expect(json?.status, `${providerId} must not answer a dispatch outcome`).toBeUndefined();
      expect(json?.dispatchedTo).toBeUndefined();
    }
  });

  it("refuses the same body even when the tenant is one the caller controls", async () => {
    // Proves the refusal is not the entitlement gate talking (that gate lives
    // inside dispatch and answers {status:"failed", reason:"…not entitled"}).
    // Here the caller is a real, freshly registered account.
    const cookie = await register(OWNER_EMAIL);
    const me = await authedJson("GET", "/api/data/reports", cookie);
    expect(me.status).toBe(200); // the account is real and authenticated

    const { status, json } = await anonymousPost("/api/monitoring/webhook/hubspot", {
      ...GENERIC_BODY,
      tenantId: OWNER_EMAIL,
    });
    expect(status).toBe(404);
    expect(json?.status).toBeUndefined();
  });

  it("answers the same refusal for a repeated event id — no processed/skipped outcome is reachable", async () => {
    const id = `slice184-dup-${TS}`;
    const first = await anonymousPost("/api/monitoring/webhook/zendesk", { ...GENERIC_BODY, id, tenantId: OWNER_EMAIL });
    const second = await anonymousPost("/api/monitoring/webhook/zendesk", { ...GENERIC_BODY, id, tenantId: OWNER_EMAIL });
    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(second.json?.status).toBeUndefined();
    expect(second.json?.reason).toBeUndefined();
  });

  it("leaves the two signed receivers mounted (they are not caught by the 404)", async () => {
    for (const path of ["/api/monitoring/webhook/xero", "/api/monitoring/webhook/slack"]) {
      const { status } = await anonymousPost(path, { events: [] });
      // Fail-closed without its signing key — but never "unknown provider".
      expect(status, `${path} must still be routed`).not.toBe(404);
    }
  });

  it("has no generic dispatch call site left in the server", () => {
    const src = readFileSync(join(process.cwd(), "prod-server.ts"), "utf-8");
    // Pins the CALL (the per-provider holder id the generic branch built), not
    // prose about it: the branch's only dispatch call site is gone for good.
    expect(src).not.toContain("holderId: `webhook-${providerId}`");
    // …and the door now answers explicitly instead of falling through to the
    // SPA HTML fallback (which would be a 200).
    expect(src).toContain('return Response.json({ error: "Unknown webhook provider" }, { status: 404 });');
  });
});

describe("Slice 184 — /api/data/reports writes, for real", () => {
  let cookie = "";

  beforeAll(async () => {
    await ensureTestServer();
    cookie = await register(OWNER_EMAIL);
  }, 60_000);

  it("creates a report that round-trips through the read path and the store on disk", async () => {
    const name = `Slice 184 revenue report ${TS}`;
    const created = await authedJson("POST", "/api/data/reports", cookie, {
      name,
      type: "revenue",
      frequency: "monthly",
      format: "csv",
    });
    // A write answers with what it wrote — never a bare {success:true}.
    expect(created.status).toBe(201);
    expect(created.json?.data?.name).toBe(name);

    // 1. read path (the same GET /portal/reports renders)
    const listed = await authedJson("GET", "/api/data/reports", cookie);
    expect(listed.status).toBe(200);
    const rows = Array.isArray(listed.json?.data) ? listed.json.data : [];
    const roundTripped = rows.find((r: any) => r?.name === name);
    expect(roundTripped, "the created report must come back from the read path").toBeTruthy();
    expect(roundTripped.type).toBe("revenue");

    // 2. system of record on disk, keyed by the tenant that created it
    const store = readStore(REPORTS_FILE);
    expect(store && typeof store === "object" && !Array.isArray(store)).toBe(true);
    const mine = Array.isArray(store[OWNER_EMAIL]) ? store[OWNER_EMAIL] : [];
    expect(mine.some((r: any) => r?.name === name), "the row must be in the store for its tenant").toBe(true);
  });

  it("refuses a report with no name and writes nothing", async () => {
    const before = (readStore(REPORTS_FILE)?.[OWNER_EMAIL] || []).length;
    const res = await authedJson("POST", "/api/data/reports", cookie, { type: "revenue" });
    expect(res.status).toBe(400);
    expect(res.json?.error).toBeTruthy();
    expect(res.json?.success).toBeUndefined();
    const after = (readStore(REPORTS_FILE)?.[OWNER_EMAIL] || []).length;
    expect(after).toBe(before);
  });

  it("keeps reports inside the tenant that wrote them", async () => {
    const otherCookie = await register(OTHER_EMAIL);
    const name = `Slice 184 tenant-scoped ${TS}`;
    await authedJson("POST", "/api/data/reports", cookie, { name });

    const otherView = await authedJson("GET", "/api/data/reports", otherCookie);
    expect(otherView.status).toBe(200);
    const otherRows = Array.isArray(otherView.json?.data) ? otherView.json.data : [];
    expect(otherRows.some((r: any) => r?.name === name), "another tenant must not read this report").toBe(false);

    // …and the other tenant's write does not erase the first tenant's rows.
    await authedJson("POST", "/api/data/reports", otherCookie, { name: `other ${TS}` });
    const store = readStore(REPORTS_FILE);
    expect((store[OWNER_EMAIL] || []).some((r: any) => r?.name === name), "merge-on-write must not clobber").toBe(true);
    expect((store[OTHER_EMAIL] || []).length).toBeGreaterThan(0);
  });
});

describe("Slice 184 — /api/data/training never answers success", () => {
  let cookie = "";

  beforeAll(async () => {
    await ensureTestServer();
    cookie = await register(OTHER_EMAIL);
  }, 60_000);

  it("answers honestly (non-2xx) and stores nothing", async () => {
    const res = await authedJson("POST", "/api/data/training", cookie, {
      title: `Slice 184 training ${TS}`,
      employee: "someone",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.json?.success).toBeUndefined();
    expect(res.json?.error).toBeTruthy();

    // Nothing was stored: the read path is still empty for this tenant…
    const listed = await authedJson("GET", "/api/data/training", cookie);
    expect(listed.status).toBe(200);
    expect(Array.isArray(listed.json?.data) ? listed.json.data.length : 0).toBe(0);

    // …and the store on disk has no row for it.
    const store = readStore(TRAINING_FILE);
    const mine = store && typeof store === "object" && !Array.isArray(store) ? store[OTHER_EMAIL] : undefined;
    expect(mine === undefined || (Array.isArray(mine) && mine.length === 0)).toBe(true);
  });
});
