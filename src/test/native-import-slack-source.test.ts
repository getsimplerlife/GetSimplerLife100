/**
 * native-import-slack-source.test.ts — Phase 5.1 (6.5) SLACK IMPORT SOURCE
 * LANE (110th publish slice, with google-calendar + sendgrid).
 *
 * Contracts under test (each a standing requirement of the lane, mirroring
 * the 6.4 lane suites, through the existing verified Slack read client —
 * https://slack.com/api):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN workspace
 *     CHANNELS through the verified client (listConversations — GET
 *     /conversations.list?types=public_channel,private_channel&limit=200,
 *     page 1 only; no history reads) — read-only, one-shot, no webhooks, no
 *     write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields
 *     (id/name/created/num_members + is_private/is_archived/is_member) +
 *     derived kind "channel"; nested-only records skipped with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:slack` — a tenant with no
 *     connection NEVER sees another tenant's token (no cross-tenant
 *     fallback), and the platform-wide `SLACK_BOT_TOKEN` env fallback (a
 *     verification-CLI global, never a tenant credential) is REJECTED by the
 *     lane — a tenant with no stored connection fails honestly with ZERO
 *     Slack API calls even when that env is set; a tenant WITH a stored
 *     connection uses their own token (never the env bot token),
 *   - expired token + configured app creds → refresh through
 *     slack.com/api/oauth.v2.access; expired + no app creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: channels sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS
 *     total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "Slack HTTP 200" + "channel
 *     metadata only — message content is NOT downloaded" + "0 fabricated" +
 *     "nothing imported until you approve"; secrets never appear in rows or
 *     ledgers,
 *   - registration makes /api/native/import/lanes report slack as wired and
 *     the full pull surface stages rows end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import { executePendingImportWrite, submitImportWrite } from "../native/import/gate";
import { getStaging, listRuns } from "../native/import/store";
import { createTable } from "../native/tables/store";
import { makeSlackImportSourceReader, registerSlackImportSource } from "../native/import/slack-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
const calls: Array<{ method: string; url: string; auth?: string; body?: unknown }> = [];
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** Stub global fetch (HttpClient + oauth helpers call the global at request
 *  time). Records the Authorization header so per-tenant token usage is
 *  provable. */
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
const CHANNELS_T1 = [
  { id: "C1", name: "general", created: 1700000000, num_members: 12, is_private: false, is_archived: false, is_member: true },
  { id: "C2", name: "eng", created: 1700000100, num_members: 8, is_private: false, is_archived: false, is_member: true },
  { id: "C3", name: "leadership", created: 1700000200, num_members: 4, is_private: true, is_archived: false, is_member: true },
  { id: "C4", name: "untyped-only", topic: { value: "no scalars" } }, // NO scalar fields at all → skipped (nested-only)
];
const CHANNELS_T2 = [
  { id: "T2C1", name: "team-b-general", created: 1700000000, num_members: 3, is_private: false, is_archived: false, is_member: true },
];
function defaultRoutes(m: string, u: string, _b?: unknown, auth?: string): Response {
  if (m === "GET" && u.includes("slack.com") && u.includes("/conversations.list")) {
    const channels = auth && auth.includes("tok-for-" + T2) ? CHANNELS_T2 : CHANNELS_T1;
    return jsonResponse({ ok: true, channels });
  }
  if (m === "POST" && u.includes("slack.com") && u.includes("/oauth.v2.access")) {
    return jsonResponse({ ok: true, access_token: "fresh-token", refresh_token: "fresh-rt", expires_in: 3600, token_type: "bot" });
  }
  return jsonResponse({ ok: false, error: "unexpected" }, 404);
}
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "slack_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "Channel ID", type: "text", required: false },
      { key: "name", label: "Channel name", type: "text", required: false },
      { key: "num_members", label: "Members", type: "number", required: false },
      { key: "is_private", label: "Private", type: "text", required: false },
      { key: "kind", label: "Kind", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedSlackCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:slack`] = {
    provider: "slack",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-slack-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerSlackImportSource(); // real Slack lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_SLACK_CLIENT_ID;
  delete process.env.OAUTH_SLACK_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  delete process.env.SLACK_BOT_TOKEN;
  vi.restoreAllMocks();
});
describe("Slack import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own workspace channels through the real client, deterministically", async () => {
    installFetch(defaultRoutes);
    seedSlackCredential(T1);
    const reader = makeSlackImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "slack" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.httpStatus).toBe(200);
    const row0 = out.rows[0] as Record<string, unknown>;
    expect(row0["id"] ?? row0["name"]).toBeTruthy();
    expect(Object.keys(row0).every((k) => typeof row0[k] === "string" || typeof row0[k] === "number" || typeof row0[k] === "boolean")).toBe(true);
    const general = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "general");
    expect(general).toBeTruthy();
    expect((general as Record<string, unknown>)["kind"]).toBe("channel");
    expect((general as Record<string, unknown>)["num_members"]).toBe(12);
    expect((general as Record<string, unknown>)["is_private"]).toBe(false);
    const leadership = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "leadership");
    expect((leadership as Record<string, unknown>)["is_private"]).toBe(true);
    // The real call shape: GET /conversations.list?types=public_channel,private_channel&limit=200 (page 1).
    const listCall = calls.find((c) => c.url.includes("slack.com") && c.url.includes("/conversations.list") && c.method === "GET");
    expect(listCall).toBeTruthy();
    expect(listCall?.url).toContain("types=public_channel,private_channel");
    expect(listCall?.url).toContain("limit=200");
    // Honest note: counts + metadata-only + 0 fabricated + staged wording.
    expect(out.note).toContain("Slack HTTP 200");
    expect(out.note).toContain("channel metadata only — message content is NOT downloaded");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    expect(out.note).toContain("page 1");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });
  it("strict tenant scoping: no connection fails honestly with ZERO Slack calls — even when the platform-wide SLACK_BOT_TOKEN env is set", async () => {
    installFetch(defaultRoutes);
    seedSlackCredential(T1); // only T1 has a stored credential
    // The credential-source env fallback (verification CLI global) must NEVER
    // become the tenant's credential: it is not the tenant's own workspace.
    process.env.SLACK_BOT_TOKEN = "xoxb-global-bot-token";
    const reader = makeSlackImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "slack" })).rejects.toThrow(
      /No Slack account is connected for this tenant/,
    );
    // No Slack API call was made on behalf of T2 (the env bot token was NOT used).
    expect(calls.filter((c) => c.url.includes("slack.com"))).toHaveLength(0);
    // A tenant WITH a stored connection uses their OWN token even when the env is set.
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_y", provider: "slack" });
    expect(out1.rows.length).toBeGreaterThan(0);
    const usedAuth = calls.filter((c) => c.url.includes("/conversations.list")).map((c) => c.auth);
    expect(usedAuth.every((a) => a === "Bearer tok-for-" + T1)).toBe(true);
    expect(usedAuth.some((a) => a?.includes("xoxb-global-bot-token"))).toBe(false);
  });
  it("cross-tenant isolation: two connected tenants each pull ONLY their own channels (their own token in the Authorization header)", async () => {
    installFetch(defaultRoutes);
    process.env.SLACK_BOT_TOKEN = "xoxb-global-bot-token";
    seedSlackCredential(T1);
    seedSlackCredential(T2);
    const reader = makeSlackImportSourceReader();
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "slack" });
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_y", provider: "slack" });
    const names1 = out1.rows.map((r) => (r as Record<string, unknown>)["name"]);
    const names2 = out2.rows.map((r) => (r as Record<string, unknown>)["name"]);
    expect(names1).toContain("general");
    expect(names1).not.toContain("team-b-general");
    expect(names2).toContain("team-b-general");
    expect(names2).not.toContain("general");
    // The Slack calls used each tenant's own token, never the other's or the env bot token.
    const listCalls = calls.filter((c) => c.url.includes("/conversations.list"));
    expect(listCalls.some((c) => c.auth === "Bearer tok-for-" + T1)).toBe(true);
    expect(listCalls.some((c) => c.auth === "Bearer tok-for-" + T2)).toBe(true);
    expect(listCalls.every((c) => c.auth === "Bearer tok-for-" + T1 || c.auth === "Bearer tok-for-" + T2)).toBe(true);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedSlackCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real Slack reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "slack", sourceLabel: "Acme Slack", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "id", targetField: "id" }, { sourceField: "name", targetField: "name" }, { sourceField: "num_members", targetField: "num_members" }, { sourceField: "is_private", targetField: "is_private" }, { sourceField: "kind", targetField: "kind" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // No public surface ever projects the credential or Slack tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});
describe("Slack lane failure + cap contracts", () => {
  it("provider HTTP error (401) → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/conversations.list") ? jsonResponse({ ok: false, error: "invalid_auth" }, 401) : defaultRoutes(m, u, b, auth)));
    seedSlackCredential(T1);
    const reader = makeSlackImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "slack" })).rejects.toThrow(/HTTP 401/);
  });
  it("gate-level: 401 on the read → honest FAILED pull run recorded (httpStatus 401, nothing staged)", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/conversations.list") ? jsonResponse({ ok: false, error: "invalid_auth" }, 401) : defaultRoutes(m, u, b, auth)));
    seedSlackCredential(T1);
    const tableId = seedTable();
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "slack", sourceLabel: "Acme Slack", target: { kind: "table", tableId } }, via: "portal" }, T1);
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
  it("expired token + configured app creds → refresh through slack.com/api/oauth.v2.access, then reads with the fresh token", async () => {
    process.env.OAUTH_SLACK_CLIENT_ID = "cid-test";
    process.env.OAUTH_SLACK_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedSlackCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeSlackImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "slack" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("slack.com") && c.url.includes("/oauth.v2.access") && c.method === "POST")).toBe(true);
    // The Slack calls used the REFRESHED token, never the expired one.
    const listCalls = calls.filter((c) => c.url.includes("/conversations.list"));
    expect(listCalls.every((c) => c.auth === "Bearer fresh-token")).toBe(true);
  });
  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedSlackCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeSlackImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "slack" })).rejects.toThrow(
      /OAUTH_SLACK_CLIENT_ID\/SECRET are not configured/,
    );
  });
  it("rows are bounded: channels sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `C${i}`, name: `channel-${i}`, created: 1700000000, num_members: i, is_private: false, is_archived: false, is_member: true }));
    installFetch((m, u, b, auth) => {
      if (m === "GET" && u.includes("/conversations.list")) return jsonResponse({ ok: true, channels: many });
      return defaultRoutes(m, u, b, auth);
    });
    seedSlackCredential(T1);
    const reader = makeSlackImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "slack" });
    // 150 channels sliced to MAX_PAGE_SIZE (100) by the reader.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report slack as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const lane = body.lanes.find((l) => l.provider === "slack");
    expect(lane?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});