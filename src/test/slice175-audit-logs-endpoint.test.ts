/**
 * SLICE 175 — GET /api/audit-logs answers what the tenant page asks it.
 *
 * THE DEFECT THIS PINS. The tenant page sent `offset`, `sortBy`, `sortDir`,
 * `severity` and `status`, and the handler read NONE of them (it parsed only
 * page/limit/search). Every filter pill and both paging buttons were therefore
 * no-ops that promised a filter the server never applied. It also had no way to
 * produce the CSV its "Export Audit CSV" button claimed to build.
 *
 * These tests assert against a seeded store, not against the page's code: the
 * expected windows and orderings are derived from the entries written here, so
 * a handler that ignores a parameter fails.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { ensureTestServer, testBaseUrl, testDataDir } from "./test-env";

const BASE_URL = testBaseUrl();
const TEST_DATA_DIR = testDataDir();
const AUDIT_FILE = join(TEST_DATA_DIR, "tenant_audit_logs.json");
const PASSWORD = "slice175-audit-pass";
const TS = Date.now();
const EMAIL = "slice175-audit-" + TS + "@example.test";
const OTHER_EMAIL = "slice175-other-" + TS + "@example.test";

const TOTAL = 30;

interface Seeded {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  detail: string;
  ip: string;
  severity?: string;
  status?: string;
}

/** Newest-last in store order: entry i is i minutes after the first. */
const ENTRIES: Seeded[] = Array.from({ length: TOTAL }, (_, i) => {
  const entry: Seeded = {
    id: `log-slice175-${String(i).padStart(2, "0")}`,
    timestamp: new Date(Date.UTC(2026, 10, 1, 0, i, 0)).toISOString(),
    user: EMAIL,
    action: `slice175.event.${String(i).padStart(2, "0")}`,
    resource: `res_${i}`,
    detail: i === 7 ? 'He said "hi", twice' : `detail ${i}`,
    ip: "127.0.0.1",
  };
  // Only SOME entries record severity/status — the rest must never satisfy a
  // filter they cannot answer.
  if (i % 10 === 0) entry.severity = "error";
  if (i % 10 === 1) entry.status = "failure";
  return entry;
});

let cookie = "";
let originalAuditFile: string | null = null;

async function registerAndGetCookie(email: string): Promise<string> {
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
  if (!m) throw new Error(`no session cookie for ${email} (status ${reg.status})`);
  return m[1]!;
}

async function getJson(query: string) {
  const res = await fetch(`${BASE_URL}/api/audit-logs${query}`, { headers: { Cookie: `session=${cookie}` } });
  return { status: res.status, json: (await res.json().catch(() => null)) as any };
}

beforeAll(async () => {
  await ensureTestServer();
  originalAuditFile = existsSync(AUDIT_FILE) ? readFileSync(AUDIT_FILE, "utf-8") : null;
  cookie = await registerAndGetCookie(EMAIL);
  writeFileSync(AUDIT_FILE, JSON.stringify({ [EMAIL]: ENTRIES, [OTHER_EMAIL]: [ENTRIES[0]] }, null, 2));
});

afterAll(() => {
  if (originalAuditFile === null) {
    try { writeFileSync(AUDIT_FILE, "{}"); } catch { /* best effort */ }
  } else {
    try { writeFileSync(AUDIT_FILE, originalAuditFile); } catch { /* best effort */ }
  }
});

describe("SLICE 175 — /api/audit-logs honours every parameter the page sends", () => {
  it("returns the rows in `data` with the real total (the shape the page reads)", async () => {
    const { status, json } = await getJson("?limit=10000");
    expect(status).toBe(200);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toHaveLength(TOTAL);
    expect(json.total).toBe(TOTAL);
    expect(json.data[0].action).toBe(ENTRIES[0]!.action);
  });

  it("pages by `page`", async () => {
    const { json } = await getJson("?page=2&limit=5");
    expect(json.data.map((r: any) => r.id)).toEqual(ENTRIES.slice(5, 10).map((e) => e.id));
    expect(json.page).toBe(2);
    expect(json.offset).toBe(5);
  });

  it("pages by `offset` (the tenant page's contract)", async () => {
    const { json } = await getJson("?offset=5&limit=5");
    expect(json.data.map((r: any) => r.id)).toEqual(ENTRIES.slice(5, 10).map((e) => e.id));
    expect(json.offset).toBe(5);
  });

  it("sorts by `sortBy`/`sortDir` — newest first", async () => {
    const { json } = await getJson("?sortBy=timestamp&sortDir=desc&limit=3");
    const times = json.data.map((r: any) => Date.parse(r.timestamp));
    expect(times).toEqual([...times].sort((a: number, b: number) => b - a));
    expect(json.data[0].id).toBe(ENTRIES[TOTAL - 1]!.id);
  });

  it("sorts by `sortBy`/`sortDir` — oldest first", async () => {
    const { json } = await getJson("?sortBy=timestamp&sortDir=asc&limit=3");
    const times = json.data.map((r: any) => Date.parse(r.timestamp));
    expect(times).toEqual([...times].sort((a: number, b: number) => a - b));
    expect(json.data[0].id).toBe(ENTRIES[0]!.id);
  });

  it("filters by `severity`, and an entry with no severity never matches", async () => {
    const { json } = await getJson("?severity=error&limit=10000");
    const expected = ENTRIES.filter((e) => e.severity === "error").map((e) => e.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(json.data.map((r: any) => r.id)).toEqual(expected);
    expect(json.total).toBe(expected.length);
  });

  it("filters by `status`", async () => {
    const { json } = await getJson("?status=failure&limit=10000");
    const expected = ENTRIES.filter((e) => e.status === "failure").map((e) => e.id);
    expect(expected.length).toBeGreaterThan(0);
    expect(json.data.map((r: any) => r.id)).toEqual(expected);
  });

  it("searches the actor as well as action/resource/detail", async () => {
    const byActor = await getJson(`?search=${encodeURIComponent(EMAIL)}&limit=10000`);
    expect(byActor.json.total).toBe(TOTAL);
    const byDetail = await getJson("?search=twice&limit=10000");
    expect(byDetail.json.total).toBe(1);
    expect(byDetail.json.data[0].id).toBe(ENTRIES[7]!.id);
  });

  it("reports stats over the whole slice, not the current window", async () => {
    const { json } = await getJson("?limit=1");
    expect(json.stats.totalEvents).toBe(TOTAL);
    expect(json.stats.uniqueUsers).toBe(1);
    expect(json.stats.firstEventAt).toBe(ENTRIES[0]!.timestamp);
    expect(json.stats.lastEventAt).toBe(ENTRIES[TOTAL - 1]!.timestamp);
  });

  it("never leaks another account's entries", async () => {
    const { json } = await getJson("?limit=10000");
    expect(json.data.every((r: any) => r.user === EMAIL)).toBe(true);
  });
});

describe("SLICE 175 — Export Audit CSV is a real CSV of the filtered rows", () => {
  it("returns text/csv with a header, every matching row, and RFC-4180 escaping", async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs?format=csv&sortBy=timestamp&sortDir=asc`, {
      headers: { Cookie: `session=${cookie}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("text/csv");
    expect(res.headers.get("content-disposition") || "").toContain("attachment");
    const text = await res.text();
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe("id,timestamp,user,action,resource,detail,ip");
    expect(lines).toHaveLength(TOTAL + 1);
    expect(lines[1]).toContain(ENTRIES[0]!.id);
    // The quote-and-comma detail must be escaped, not split across columns.
    expect(text).toContain('"He said ""hi"", twice"');
  });

  it("honours the search filter in the export", async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs?format=csv&search=twice`, {
      headers: { Cookie: `session=${cookie}` },
    });
    const lines = (await res.text()).trim().split("\r\n");
    expect(lines).toHaveLength(2); // header + the one matching row
    expect(lines[1]).toContain(ENTRIES[7]!.id);
  });

  it("is fail-closed: an unauthenticated export is a 401, not a CSV", async () => {
    const res = await fetch(`${BASE_URL}/api/audit-logs?format=csv`);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("id,timestamp,user");
  });
});
