import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

/**
 * SLICE 159 — the page counter proved through the REAL self-hosted server.
 *
 * Slice 158's lesson: a green unit suite is not evidence that a page works. The
 * unit tests in `page-views-159.test.ts` prove the aggregation; this file proves
 * the wiring — that an actual HTTP GET of an actual HTML page, served by the
 * actual `prod-server.ts`, lands in the counter that the owner's actual admin
 * endpoint reads, and that the admin endpoint is owner-only (401 unsigned,
 * 403 non-owner) exactly like every other admin route.
 *
 * HOW THE ASSERTIONS AVOID FLAKES: the shared test server is also being hit by
 * other test files in the same run, so
 *   - "this WAS counted" is asserted as a delta (`>= before + 1`), which other
 *     traffic can only help;
 *   - "this was NOT counted" is asserted against the persisted store for that
 *     exact path, never against a global total that another file could move.
 */
const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const PASSWORD = "page-views-159-pass";
const TS = Date.now();
const OWNER_EMAIL = "mathewortiz97@gmail.com";
const OWNER_TOKEN = "owner-pv159-" + TS;
const CUSTOMER_EMAIL = "pv159-" + TS + "@example.test";

/** A normal browser UA — the counter must accept it. */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/** A crawler UA — the counter must drop it at the door. */
const BOT_UA = "Googlebot/2.1 (+http://www.google.com/bot.html)";

const HUMAN_PATH = "/how-it-works";
const BOT_PATH = "/resources/templates";
const MISSING_PATH = "/page-views-159-no-such-page";

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

interface Summary {
  totalViews: number;
  uniquePaths: number;
  days: { day: string; views: number }[];
  topPaths: { path: string; views: number }[];
  hasAnyData: boolean;
  windowDays: number;
  storedDays: number;
  retentionDays: number;
  readError: string | null;
  writeHealth: { ok: boolean; lastError: string | null; failingSince: string | null; pendingInMemory: number };
}

async function ownerSummary(cookie: string): Promise<{ status: number; body: Summary | null }> {
  const res = await fetch(`${BASE_URL}/api/admin/page-views`, { headers: { Cookie: `session=${cookie}` } });
  let body: Summary | null = null;
  try { body = (await res.json()) as Summary; } catch { body = null; }
  return { status: res.status, body };
}

/** Views recorded for one path in the owner's view (0 when it is not ranked). */
function viewsFor(summary: Summary | null, path: string): number {
  return summary?.topPaths.find((row) => row.path === path)?.views ?? 0;
}

/** The persisted aggregate, after waiting for the coalesced flush (≤1s). */
async function flushedStore(): Promise<{ raw: string; doc: any; today: Record<string, number> }> {
  // The server flushes coalesced writes at most once a second and also on a
  // 1.5s background tick, so give the last view time to reach disk.
  await new Promise((r) => setTimeout(r, 2300));
  const file = join(TEST_DATA_DIR, "page_views.json");
  expect(existsSync(file)).toBe(true);
  const raw = readFileSync(file, "utf-8");
  const doc = JSON.parse(raw);
  const today = new Date().toISOString().slice(0, 10);
  return { raw, doc, today: doc.days?.[today] ?? {} };
}

/** A page GET with an explicit User-Agent (so bot filtering is provable). */
async function pageGet(path: string, userAgent: string) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml" },
    redirect: "manual",
  });
}

/** Remove only this run's trace: the test customer + our owner token. */
function removeTestRecords(): void {
  for (const file of ["users.json", "sessions.json"]) {
    const path = join(TEST_DATA_DIR, file);
    if (!existsSync(path)) continue;
    try {
      const data = readJSONFile(path);
      if (typeof data !== "object" || data === null || Array.isArray(data)) continue;
      let changed = false;
      for (const [tok, v] of Object.entries(data)) {
        const s = v as any;
        const email = typeof s === "string" ? s : (s && typeof s === "object" ? s.email : undefined);
        if (typeof email === "string" && email === CUSTOMER_EMAIL) {
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

describe("SLICE 159 — page counter through the real server", () => {
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

  it("unsigned request is 401 on the admin read", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/page-views`);
    expect(res.status).toBe(401);
  });

  it("a non-owner is 403 on the admin read", async () => {
    const res = await fetch(`${BASE_URL}/api/admin/page-views`, {
      headers: { Cookie: `session=${customerCookie}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json().catch(() => ({}));
    expect(body?.error).toBe("Admin access required");
  });

  it("the owner gets a real summary shape (not a stub)", async () => {
    const { status, body } = await ownerSummary(ownerCookie!);
    expect(status).toBe(200);
    expect(body).not.toBeNull();
    expect(typeof body!.totalViews).toBe("number");
    expect(typeof body!.hasAnyData).toBe("boolean");
    expect(body!.windowDays).toBe(30);
    // The series is a real 30-day series, ascending, one entry per day.
    expect(Array.isArray(body!.days)).toBe(true);
    expect(body!.days).toHaveLength(30);
    expect(body!.days[body!.days.length - 1].day >= body!.days[0].day).toBe(true);
    expect(Array.isArray(body!.topPaths)).toBe(true);
    expect(body!.topPaths.length).toBeLessThanOrEqual(25);
    // The counter reports its own write health rather than hiding a failure.
    expect(body!.writeHealth).toBeTruthy();
    expect(typeof body!.writeHealth.ok).toBe("boolean");
  });

  it("a real browser GET of a page is counted, and lands in DATA_DIR", async () => {
    const before = (await ownerSummary(ownerCookie!)).body!;
    const res = await pageGet(HUMAN_PATH, BROWSER_UA);
    expect(res.status).toBe(200);
    expect((res.headers.get("content-type") || "")).toContain("text/html");
    await res.text(); // drain, so the server finishes the response

    const after = (await ownerSummary(ownerCookie!)).body!;
    expect(after.totalViews).toBeGreaterThanOrEqual(before.totalViews + 1);
    expect(after.hasAnyData).toBe(true);

    const { today } = await flushedStore();
    expect(today[HUMAN_PATH] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("two GETs of two different pages both land in the counter", async () => {
    const before = (await ownerSummary(ownerCookie!)).body!;
    for (const path of ["/", "/pricing"]) {
      const res = await pageGet(path, BROWSER_UA);
      expect(res.status).toBe(200);
      await res.text();
    }
    const after = (await ownerSummary(ownerCookie!)).body!;
    expect(after.totalViews).toBeGreaterThanOrEqual(before.totalViews + 2);
    // Both paths are in the window's aggregate (ranked, or at least counted).
    const ranked = after.topPaths.map((row) => row.path);
    const inAggregate = ["/", "/pricing"].filter((p) => ranked.includes(p) || viewsFor(after, p) > 0);
    expect(inAggregate.length).toBeGreaterThanOrEqual(1);
    const { today } = await flushedStore();
    expect(today["/"] ?? 0).toBeGreaterThanOrEqual(1);
    expect(today["/pricing"] ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("a crawler GET is served but NOT counted (dropped at the door)", async () => {
    const res = await pageGet(BOT_PATH, BOT_UA);
    // The page is still SERVED to the crawler — filtering never breaks a page.
    expect([200, 404]).toContain(res.status);
    await res.text();
    const { today, doc } = await flushedStore();
    expect(today[BOT_PATH] ?? 0).toBe(0);
    // And the crawler's User-Agent string is nowhere in the stored document.
    expect(JSON.stringify(doc)).not.toContain("Googlebot");
  });

  it("API calls and 404s are never counted as page views", async () => {
    await (await fetch(`${BASE_URL}/api/health`)).text();
    const missing = await pageGet(MISSING_PATH, BROWSER_UA);
    expect(missing.status).toBe(404);
    await missing.text();
    const { today } = await flushedStore();
    expect(today[MISSING_PATH] ?? 0).toBe(0);
    // No API path may ever appear in the aggregate.
    for (const path of Object.keys(today)) expect(path.startsWith("/api")).toBe(false);
  });

  it("the stored document holds path × day counts and no personal data", async () => {
    const { raw, doc } = await flushedStore();
    expect(doc.version).toBe(1);
    expect(typeof doc.days).toBe("object");
    const dayKeys = Object.keys(doc.days);
    expect(dayKeys.length).toBeGreaterThan(0);
    for (const key of dayKeys) expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Privacy by construction: the file holds path → count and nothing else.
    expect(raw).not.toMatch(/(\d{1,3}\.){3}\d{1,3}/); // no IP address anywhere
    expect(raw.toLowerCase()).not.toContain("useragent");
    expect(raw.toLowerCase()).not.toContain("user-agent");
    expect(raw).not.toContain("@"); // no email address
    expect(raw.toLowerCase()).not.toContain("session");
    // Every stored value is a positive integer count.
    for (const paths of Object.values(doc.days as Record<string, Record<string, unknown>>)) {
      for (const count of Object.values(paths)) {
        expect(typeof count).toBe("number");
        expect(Number.isInteger(count)).toBe(true);
        expect(count as number).toBeGreaterThan(0);
      }
    }
  });
});
