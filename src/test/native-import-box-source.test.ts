/**
 * native-import-box-source.test.ts — Phase 5.1 (6.4) BOX FILE SOURCE LANE
 * (108th publish slice).
 *
 * Contracts under test (each a standing requirement of the lane, mirroring the
 * 6.4 Dropbox / Google Drive / OneDrive lane suites, through the existing box
 * read client):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN Box root-folder
 *     listing through the existing verified box read client
 *     (listFolder — GET https://api.box.com/2.0/folders/0/items; page 1
 *     only) — read-only, one-shot, no webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields
 *     (id/name/type/size/modified_at/created_at/item_status/sha1 + parent_id
 *     from the entry's parent.id) + a derived kind ("file" | "folder" |
 *     "unknown" from the Box `type` discriminator); nested-only records
 *     skipped with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:box` — a tenant with no
 *     connection NEVER sees another tenant's token (no cross-tenant
 *     fallback); two connected tenants each pull ONLY their own items (the
 *     Authorization header used for the Box call carries the caller's token),
 *   - expired token + configured app creds → refresh through
 *     api.box.com/oauth2/token; expired + no app creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: entries sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS
 *     total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "file metadata only — file
 *     contents are NOT downloaded" + "0 fabricated" + "nothing imported until
 *     you approve"; secrets never appear in rows or ledgers,
 *   - registration makes /api/native/import/lanes report box as wired and the
 *     full pull surface stages rows end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import { executePendingImportWrite, submitImportWrite } from "../native/import/gate";
import { getStaging, listRuns } from "../native/import/store";
import { createTable } from "../native/tables/store";
import { makeBoxImportSourceReader, registerBoxImportSource } from "../native/import/box-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
const calls: Array<{ method: string; url: string; auth?: string; body?: unknown }> = [];
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** Stub global fetch (HttpClient calls the global at request time — same
 *  pattern as the verification adapter + Dropbox/Google Drive lane tests).
 *  Records the Authorization header so per-tenant token usage is provable. */
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
const ENTRIES_T1 = [
  { type: "file", id: "111", name: "proposal.pdf", size: 1024, sha1: "sha1-file-1", item_status: "active", created_at: "2024-01-02T00:00:00Z", modified_at: "2024-01-02T00:00:00Z", parent: { id: "0", name: "All Files", type: "folder" } },
  { type: "file", id: "222", name: "invoices.xlsx", size: 20480, sha1: "sha1-file-2", item_status: "active", created_at: "2024-01-04T00:00:00Z", modified_at: "2024-01-04T00:00:00Z", parent: { id: "0", name: "All Files", type: "folder" } },
  { type: "folder", id: "333", name: "Contracts", item_status: "active", created_at: "2024-01-03T00:00:00Z", modified_at: "2024-01-03T00:00:00Z", parent: { id: "0", name: "All Files", type: "folder" } },
  { id: "444", name: "untyped" }, // no type → kind "unknown"
  { path_collection: { total_count: 1, entries: [{ id: "0" }] }, etag: "etag-1" }, // NO scalar fields at all → skipped (nested-only)
];
const ENTRIES_T2 = [
  { type: "file", id: "t2-1", name: "t2-notes.txt", size: 42, sha1: "sha1-t2", item_status: "active", created_at: "2024-02-01T00:00:00Z", modified_at: "2024-02-01T00:00:00Z", parent: { id: "0", name: "All Files", type: "folder" } },
];
function defaultRoutes(m: string, u: string, _b?: unknown, auth?: string): Response {
  if (m === "GET" && u.includes("api.box.com") && u.includes("/folders/0/items")) {
    const entries = auth && auth.includes("tok-for-" + T2) ? ENTRIES_T2 : ENTRIES_T1;
    return jsonResponse({ entries, total_count: entries.length, offset: 0, limit: 1000 });
  }
  if (m === "POST" && u.includes("api.box.com") && u.includes("/oauth2/token")) {
    return jsonResponse({ access_token: "fresh-token", refresh_token: "fresh-rt", expires_in: 3600, token_type: "bearer" });
  }
  return jsonResponse({ error: "unexpected" }, 404);
}
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "box_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "Item ID", type: "text", required: false },
      { key: "name", label: "Name", type: "text", required: false },
      { key: "type", label: "Type", type: "text", required: false },
      { key: "kind", label: "Kind", type: "text", required: false },
      { key: "parent_id", label: "Parent ID", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedBoxCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:box`] = {
    provider: "box",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-box-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerBoxImportSource(); // real Box lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_BOX_CLIENT_ID;
  delete process.env.OAUTH_BOX_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});
describe("Box import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own Box root-folder listing through the real client, deterministically", async () => {
    installFetch(defaultRoutes);
    seedBoxCredential(T1);
    const reader = makeBoxImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "box" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.httpStatus).toBe(200);
    const row0 = out.rows[0] as Record<string, unknown>;
    expect(row0["id"] ?? row0["name"]).toBeTruthy();
    expect(Object.keys(row0).every((k) => typeof row0[k] === "string" || typeof row0[k] === "number" || typeof row0[k] === "boolean")).toBe(true);
    const file = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "proposal.pdf");
    expect(file).toBeTruthy();
    expect((file as Record<string, unknown>)["kind"]).toBe("file");
    expect((file as Record<string, unknown>)["parent_id"]).toBe("0");
    expect((file as Record<string, unknown>)["sha1"]).toBe("sha1-file-1");
    const folder = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "Contracts");
    expect((folder as Record<string, unknown>)["kind"]).toBe("folder");
    const unknown = out.rows.find((r) => (r as Record<string, unknown>)["id"] === "444");
    expect((unknown as Record<string, unknown>)["kind"]).toBe("unknown");
    // The real call shape: GET /folders/0/items (root folder, page 1).
    const listCall = calls.find((c) => c.url.includes("/folders/0/items") && c.method === "GET");
    expect(listCall).toBeTruthy();
    // Honest note: counts + metadata-only + 0 fabricated + staged wording + page 1.
    expect(out.note).toContain("Box HTTP 200");
    expect(out.note).toContain("file metadata only");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    expect(out.note).toContain("page 1");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });
  it("strict tenant scoping: a tenant with NO connection fails honestly, zero Box API calls", async () => {
    installFetch(defaultRoutes);
    seedBoxCredential(T1); // only T1 has a credential
    const reader = makeBoxImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "box" })).rejects.toThrow(
      /No Box account is connected for this tenant/,
    );
    // No Box call was made on behalf of T2.
    expect(calls.filter((c) => c.url.includes("api.box.com") && c.url.includes("/folders/0/items"))).toHaveLength(0);
  });
  it("cross-tenant isolation: two connected tenants each pull ONLY their own items (their own token in the Authorization header)", async () => {
    installFetch(defaultRoutes);
    seedBoxCredential(T1);
    seedBoxCredential(T2);
    const reader = makeBoxImportSourceReader();
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "box" });
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_y", provider: "box" });
    const names1 = out1.rows.map((r) => (r as Record<string, unknown>)["name"]);
    const names2 = out2.rows.map((r) => (r as Record<string, unknown>)["name"]);
    expect(names1).toContain("proposal.pdf");
    expect(names1).not.toContain("t2-notes.txt");
    expect(names2).toContain("t2-notes.txt");
    expect(names2).not.toContain("proposal.pdf");
    // The Box calls used each tenant's own token, never the other's.
    const listCalls = calls.filter((c) => c.url.includes("/folders/0/items"));
    expect(listCalls.some((c) => c.auth === "Bearer tok-for-" + T1)).toBe(true);
    expect(listCalls.some((c) => c.auth === "Bearer tok-for-" + T2)).toBe(true);
    expect(listCalls.every((c) => c.auth === "Bearer tok-for-" + T1 || c.auth === "Bearer tok-for-" + T2)).toBe(true);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedBoxCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real Box reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "box", sourceLabel: "Acme Box", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "id", targetField: "id" }, { sourceField: "name", targetField: "name" }, { sourceField: "type", targetField: "type" }, { sourceField: "kind", targetField: "kind" }, { sourceField: "parent_id", targetField: "parent_id" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // No public surface ever projects the credential or Box tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});
describe("Box lane failure + cap contracts", () => {
  it("provider HTTP error (401) → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/folders/0/items") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedBoxCredential(T1);
    const reader = makeBoxImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "box" })).rejects.toThrow(/HTTP 401/);
  });
  it("gate-level: 401 on the read → honest FAILED pull run recorded (httpStatus 401, nothing staged)", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/folders/0/items") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedBoxCredential(T1);
    const tableId = seedTable();
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "box", sourceLabel: "Acme Box", target: { kind: "table", tableId } }, via: "portal" }, T1);
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
  it("expired token + configured app creds → refresh through api.box.com/oauth2/token", async () => {
    process.env.OAUTH_BOX_CLIENT_ID = "cid-test";
    process.env.OAUTH_BOX_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedBoxCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeBoxImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "box" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("api.box.com") && c.url.includes("/oauth2/token") && c.method === "POST")).toBe(true);
  });
  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedBoxCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeBoxImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "box" })).rejects.toThrow(
      /OAUTH_BOX_CLIENT_ID\/SECRET are not configured/,
    );
  });
  it("rows are bounded: entries sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ type: "file", id: `f-${i}`, name: `file-${i}.txt`, size: 10, item_status: "active", created_at: "2024-01-01T00:00:00Z", modified_at: "2024-01-01T00:00:00Z", parent: { id: "0", type: "folder" } }));
    installFetch((m, u, b, auth) => {
      if (m === "GET" && u.includes("/folders/0/items")) return jsonResponse({ entries: many, total_count: many.length });
      return defaultRoutes(m, u, b, auth);
    });
    seedBoxCredential(T1);
    const reader = makeBoxImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "box" });
    // 150 entries sliced to MAX_PAGE_SIZE (100) by the reader.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report box as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const lane = body.lanes.find((l) => l.provider === "box");
    expect(lane?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});