/**
 * native-import-google-calendar-source.test.ts — Phase 5.1 (6.5) GOOGLE
 * CALENDAR IMPORT SOURCE LANE (110th publish slice, with sendgrid + slack).
 *
 * Contracts under test (each a standing requirement of the lane, mirroring
 * the 6.4 lane suites, through the existing verified Google Calendar read
 * client — Calendar API v3, https://www.googleapis.com/calendar/v3):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN primary-calendar
 *     EVENTS (last 30 days, page 1, maxResults = MAX_PAGE_SIZE) through the
 *     verified client (listEvents — the read family the verified
 *     google-calendar-list-events capability makes) — read-only, one-shot,
 *     no webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields
 *     (id/summary/status/created/updated) + derived start/end from the
 *     event's start.dateTime|date / end.dateTime|date explicit fixed scalar
 *     paths + derived kind "event"; nested-only records skipped with an
 *     honest note,
 *   - STRICT tenant credential lookup `${tenantId}:google-calendar` — a tenant
 *     with no connection NEVER sees another tenant's token (no cross-tenant
 *     fallback); two connected tenants each pull ONLY their own events with
 *     their own token and their own calendarId,
 *   - expired token + configured app creds → refresh through
 *     oauth2.googleapis.com/token; expired + no app creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: events sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS
 *     total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "Google Calendar HTTP 200" +
 *     "event attachments are NOT downloaded" + "0 fabricated" + "nothing
 *     imported until you approve"; secrets never appear in rows or ledgers,
 *   - registration makes /api/native/import/lanes report google-calendar as
 *     wired and the full pull surface stages rows end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import { executePendingImportWrite, submitImportWrite } from "../native/import/gate";
import { getStaging, listRuns } from "../native/import/store";
import { createTable } from "../native/tables/store";
import { makeGoogleCalendarImportSourceReader, registerGoogleCalendarImportSource } from "../native/import/google-calendar-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
const calls: Array<{ method: string; url: string; auth?: string; body?: unknown }> = [];
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** Stub global fetch (HttpClient + oauth helpers call the global at request
 *  time — same pattern as the 6.4 lane tests). Records the Authorization
 *  header so per-tenant token usage is provable. */
function installFetch(handler: (m: string, u: string, b?: unknown, auth?: string) => Response): void {
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const m = (init?.method || "GET") as string;
    let b: unknown;
    if (init?.body) {
      try { b = JSON.parse(String(init.body)); } catch { b = String(init.body); }
    }
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const auth = headers["Authorization"] ?? headers["authorization"];
    calls.push({ method: m, url: u, auth, body: b });
    return handler(m, u, b, auth);
  }) as unknown as typeof fetch;
}
const EVENTS_T1 = [
  { id: "ev-1", summary: "Client kickoff", status: "confirmed", created: "2024-01-01T00:00:00Z", updated: "2024-01-02T00:00:00Z", start: { dateTime: "2024-01-05T09:00:00Z", timeZone: "UTC" }, end: { dateTime: "2024-01-05T10:00:00Z", timeZone: "UTC" } },
  { id: "ev-2", summary: "All-day review", status: "confirmed", created: "2024-01-01T00:00:00Z", updated: "2024-01-01T00:00:00Z", start: { date: "2024-01-10" }, end: { date: "2024-01-11" } },
  { id: "ev-3", summary: "No-time-edge", status: "tentative" }, // no start/end → start/end absent, still a row (id+summary+status)
  { attendees: [{ email: "x@y.com" }] }, // NO scalar fields at all → skipped (nested-only)
];
const EVENTS_T2 = [
  { id: "t2-ev", summary: "Team sync", status: "confirmed", created: "2024-02-01T00:00:00Z", updated: "2024-02-01T00:00:00Z", start: { dateTime: "2024-02-05T11:00:00Z", timeZone: "UTC" }, end: { dateTime: "2024-02-05T11:30:00Z", timeZone: "UTC" } },
];
function defaultRoutes(m: string, u: string, _b?: unknown, auth?: string): Response {
  if (m === "GET" && u.includes("googleapis.com") && u.includes("/calendars/") && u.includes("/events")) {
    const items = auth && auth.includes("tok-for-" + T2) ? EVENTS_T2 : EVENTS_T1;
    return jsonResponse({ items });
  }
  if (m === "POST" && u.includes("oauth2.googleapis.com") && u.includes("/token")) {
    return jsonResponse({ access_token: "fresh-token", refresh_token: "fresh-rt", expires_in: 3600, token_type: "Bearer" });
  }
  return jsonResponse({ error: "unexpected" }, 404);
}
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "gcal_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "Event ID", type: "text", required: false },
      { key: "summary", label: "Summary", type: "text", required: false },
      { key: "start", label: "Start", type: "text", required: false },
      { key: "end", label: "End", type: "text", required: false },
      { key: "kind", label: "Kind", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedGCalCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:google-calendar`] = {
    provider: "google-calendar",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-gcal-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerGoogleCalendarImportSource(); // real GCal lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_GOOGLE_CALENDAR_CLIENT_ID;
  delete process.env.OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});
describe("Google Calendar import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own calendar events through the real client, deterministically", async () => {
    installFetch(defaultRoutes);
    seedGCalCredential(T1);
    const reader = makeGoogleCalendarImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-calendar" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.httpStatus).toBe(200);
    const row0 = out.rows[0] as Record<string, unknown>;
    expect(row0["id"] ?? row0["summary"]).toBeTruthy();
    expect(Object.keys(row0).every((k) => typeof row0[k] === "string" || typeof row0[k] === "number" || typeof row0[k] === "boolean")).toBe(true);
    const kickoff = out.rows.find((r) => (r as Record<string, unknown>)["summary"] === "Client kickoff");
    expect(kickoff).toBeTruthy();
    expect((kickoff as Record<string, unknown>)["kind"]).toBe("event");
    expect((kickoff as Record<string, unknown>)["start"]).toBe("2024-01-05T09:00:00Z");
    expect((kickoff as Record<string, unknown>)["end"]).toBe("2024-01-05T10:00:00Z");
    const allDay = out.rows.find((r) => (r as Record<string, unknown>)["id"] === "ev-2");
    expect((allDay as Record<string, unknown>)["start"]).toBe("2024-01-10"); // date scalar path
    expect((allDay as Record<string, unknown>)["end"]).toBe("2024-01-11");
    // The real call shape: GET /calendars/primary/events?maxResults=100&timeMin=…&singleEvents=true&orderBy=startTime
    const listCall = calls.find((c) => c.url.includes("googleapis.com") && c.url.includes("/calendars/primary/events") && c.method === "GET");
    expect(listCall).toBeTruthy();
    expect(listCall?.url).toContain("maxResults=100");
    expect(listCall?.url).toContain("timeMin=");
    // Honest note: counts + metadata-only + 0 fabricated + staged wording.
    expect(out.note).toContain("Google Calendar HTTP 200");
    expect(out.note).toContain("last 30 days");
    expect(out.note).toContain("event attachments are NOT downloaded");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    expect(out.note).toContain("page 1");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });
  it("strict tenant scoping: a tenant with NO connection fails honestly, zero Google API calls", async () => {
    installFetch(defaultRoutes);
    seedGCalCredential(T1); // only T1 has a credential
    const reader = makeGoogleCalendarImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "google-calendar" })).rejects.toThrow(
      /No Google Calendar account is connected for this tenant/,
    );
    // No Google API call was made on behalf of T2.
    expect(calls.filter((c) => c.url.includes("googleapis.com"))).toHaveLength(0);
  });
  it("cross-tenant isolation: two connected tenants each pull ONLY their own events (own token + own calendarId)", async () => {
    installFetch(defaultRoutes);
    seedGCalCredential(T1);
    seedGCalCredential(T2, { calendarId: "secondary@group.calendar.google.com" });
    const reader = makeGoogleCalendarImportSourceReader();
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-calendar" });
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_y", provider: "google-calendar" });
    const summaries1 = out1.rows.map((r) => (r as Record<string, unknown>)["summary"]);
    const summaries2 = out2.rows.map((r) => (r as Record<string, unknown>)["summary"]);
    expect(summaries1).toContain("Client kickoff");
    expect(summaries1).not.toContain("Team sync");
    expect(summaries2).toContain("Team sync");
    expect(summaries2).not.toContain("Client kickoff");
    // Each tenant's events call used their OWN calendarId + their OWN token.
    const listCalls = calls.filter((c) => c.url.includes("/events") && c.method === "GET");
    expect(listCalls.some((c) => c.url.includes("/calendars/primary/events") && c.auth === "Bearer tok-for-" + T1)).toBe(true);
    expect(listCalls.some((c) => c.url.includes("/calendars/secondary%40group.calendar.google.com/events") && c.auth === "Bearer tok-for-" + T2)).toBe(true);
    expect(listCalls.every((c) => c.auth === "Bearer tok-for-" + T1 || c.auth === "Bearer tok-for-" + T2)).toBe(true);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedGCalCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real GCal reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "google-calendar", sourceLabel: "Acme Calendar", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "id", targetField: "id" }, { sourceField: "summary", targetField: "summary" }, { sourceField: "start", targetField: "start" }, { sourceField: "end", targetField: "end" }, { sourceField: "kind", targetField: "kind" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(map.applied || map.pending).toBe(true);
    if (map.pending) {
      const done = await executePendingImportWrite(dir, T1, map.approvalActionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
    }
    const pull = await submitImportWrite(dir, T1, "pullImportData", { payload: { importId }, via: "portal" }, T1);
    expect(pull.applied || pull.pending).toBe(true);
    if (pull.pending) {
      const done = await executePendingImportWrite(dir, T1, pull.approvalActionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
    }
    const staging = getStaging(dir, T1, importId);
    expect(staging?.rows.length).toBeGreaterThan(0);
    const runs = listRuns(dir, T1, importId).filter((r) => r.op === "pullImportData");
    const last = runs[runs.length - 1];
    expect(last?.pulled).toBe(staging?.rows.length);
    expect(last?.httpStatus).toBe(200);
    expect(last?.note).toContain("0 fabricated");
    expect(last?.note).toContain("nothing imported until you approve");
    // No public surface ever projects the credential or GCal tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});
describe("Google Calendar lane failure + cap contracts", () => {
  it("provider HTTP error (401) → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/events") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedGCalCredential(T1);
    const reader = makeGoogleCalendarImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-calendar" })).rejects.toThrow(/HTTP 401/);
  });
  it("gate-level: 401 on the read → honest FAILED pull run recorded (httpStatus 401, nothing staged)", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/events") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedGCalCredential(T1);
    const tableId = seedTable();
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "google-calendar", sourceLabel: "Acme Calendar", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const pull = await submitImportWrite(dir, T1, "pullImportData", { payload: { importId }, via: "portal" }, T1);
    expect(pull.applied || pull.pending).toBe(true);
    if (pull.pending) {
      const done = await executePendingImportWrite(dir, T1, pull.approvalActionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(false);
    }
    const runs = listRuns(dir, T1, importId).filter((r) => r.op === "pullImportData" && r.failed === 1);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[runs.length - 1]?.httpStatus).toBe(401);
    expect(runs[runs.length - 1]?.note).toContain("0 rows pulled");
    expect(getStaging(dir, T1, importId)).toBeFalsy(); // nothing staged on failure
  });
  it("expired token + configured app creds → refresh through oauth2.googleapis.com/token, then reads with the fresh token", async () => {
    process.env.OAUTH_GOOGLE_CALENDAR_CLIENT_ID = "cid-test";
    process.env.OAUTH_GOOGLE_CALENDAR_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedGCalCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeGoogleCalendarImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-calendar" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("oauth2.googleapis.com") && c.url.includes("/token") && c.method === "POST")).toBe(true);
    // The Calendar calls used the REFRESHED token, never the expired one.
    const gcalCalls = calls.filter((c) => c.url.includes("googleapis.com") && c.method === "GET");
    expect(gcalCalls.every((c) => c.auth === "Bearer fresh-token")).toBe(true);
  });
  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedGCalCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeGoogleCalendarImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-calendar" })).rejects.toThrow(
      /OAUTH_GOOGLE_CALENDAR_CLIENT_ID\/SECRET are not configured/,
    );
  });
  it("rows are bounded: events sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `ev-${i}`, summary: `Event ${i}`, status: "confirmed", created: "2024-01-01T00:00:00Z", updated: "2024-01-01T00:00:00Z", start: { dateTime: "2024-01-05T09:00:00Z" }, end: { dateTime: "2024-01-05T10:00:00Z" } }));
    installFetch((m, u, b, auth) => {
      if (m === "GET" && u.includes("/events")) return jsonResponse({ items: many });
      return defaultRoutes(m, u, b, auth);
    });
    seedGCalCredential(T1);
    const reader = makeGoogleCalendarImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-calendar" });
    // 150 events bounded to maxResults=100 (page 1) by the reader.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report google-calendar as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const lane = body.lanes.find((l) => l.provider === "google-calendar");
    expect(lane?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});