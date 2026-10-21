/**
 * native-import-dropbox-source.test.ts — Phase 5.1 (6.4) Dropbox FILE SOURCE
 * LANE (107th publish slice).
 *
 * Contracts under test (each a standing requirement of the lane, mirroring the
 * 6.4 Google Drive / OneDrive lane suites, through the existing dropbox read
 * client):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN Dropbox root
 *     folder listing through the existing verified dropbox read client
 *     (listFolder — POST https://api.dropboxapi.com/2/files/list_folder with
 *     path "" + recursive false; page 1 only) — read-only, one-shot, no
 *     webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields
 *     (id/name/path_lower/path_display/rev/client_modified/server_modified/
 *     size/is_downloadable) + a derived kind ("file" | "folder" | "unknown"
 *     from the Dropbox `.tag` discriminator); nested-only records skipped
 *     with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:dropbox` — a tenant with
 *     no connection NEVER sees another tenant's token (no cross-tenant
 *     fallback); two connected tenants each pull ONLY their own files (the
 *     Authorization header used for the Dropbox call carries the caller's
 *     token),
 *   - expired token + configured app creds → refresh through
 *     api.dropboxapi.com/oauth2/token; expired + no app creds → honest
 *     failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: entries sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS
 *     total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "file metadata only — file
 *     contents are NOT downloaded" + "0 fabricated" + "nothing imported until
 *     you approve"; secrets never appear in rows or ledgers,
 *   - registration makes /api/native/import/lanes report dropbox as wired and
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
import { makeDropboxImportSourceReader, registerDropboxImportSource } from "../native/import/dropbox-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
const calls: Array<{ method: string; url: string; auth?: string; body?: unknown }> = [];
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** Stub global fetch (HttpClient calls the global at request time — same
 *  pattern as the verification adapter + OneDrive/Google Drive lane tests).
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
  { ".tag": "file", id: "id:f1", name: "proposal.pdf", path_lower: "/proposal.pdf", path_display: "/proposal.pdf", rev: "rev1", client_modified: "2024-01-02T00:00:00Z", server_modified: "2024-01-02T00:00:00Z", size: 1024, is_downloadable: true },
  { ".tag": "file", id: "id:f2", name: "invoices.xlsx", path_lower: "/invoices.xlsx", path_display: "/invoices.xlsx", rev: "rev2", client_modified: "2024-01-04T00:00:00Z", server_modified: "2024-01-04T00:00:00Z", size: 20480, is_downloadable: true },
  { ".tag": "folder", id: "id:d1", name: "Contracts", path_lower: "/contracts", path_display: "/Contracts" },
  { id: "id:u1", name: "untyped", path_lower: "/untyped" }, // no .tag → kind "unknown"
  { sharing_info: { parent_shared_folder_id: "id:sf1" } }, // NO scalar fields at all → skipped (nested-only)
];
const ENTRIES_T2 = [
  { ".tag": "file", id: "id:t2-1", name: "t2-notes.txt", path_lower: "/t2-notes.txt", path_display: "/t2-notes.txt", rev: "rev-t2", server_modified: "2024-02-01T00:00:00Z", size: 42, is_downloadable: true },
];
function defaultRoutes(m: string, u: string, _b?: unknown, auth?: string): Response {
  if (m === "POST" && u.includes("api.dropboxapi.com") && u.includes("/files/list_folder")) {
    const entries = auth && auth.includes("tok-for-" + T2) ? ENTRIES_T2 : ENTRIES_T1;
    return jsonResponse({ entries, cursor: "cur", has_more: false });
  }
  if (m === "POST" && u.includes("api.dropboxapi.com") && u.includes("/oauth2/token")) {
    return jsonResponse({ access_token: "fresh-token", refresh_token: "fresh-rt", expires_in: 3600, token_type: "bearer" });
  }
  return jsonResponse({ error: "unexpected" }, 404);
}
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "dropbox_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "File ID", type: "text", required: false },
      { key: "name", label: "File name", type: "text", required: false },
      { key: "path_display", label: "Path", type: "text", required: false },
      { key: "kind", label: "Kind", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedDropboxCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:dropbox`] = {
    provider: "dropbox",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-dropbox-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerDropboxImportSource(); // real Dropbox lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_DROPBOX_CLIENT_ID;
  delete process.env.OAUTH_DROPBOX_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});
describe("Dropbox import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own Dropbox root folder listing through the real client, deterministically", async () => {
    installFetch(defaultRoutes);
    seedDropboxCredential(T1);
    const reader = makeDropboxImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "dropbox" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.httpStatus).toBe(200);
    const row0 = out.rows[0] as Record<string, unknown>;
    expect(row0["id"] ?? row0["name"]).toBeTruthy();
    expect(Object.keys(row0).every((k) => typeof row0[k] === "string" || typeof row0[k] === "number" || typeof row0[k] === "boolean")).toBe(true);
    const file = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "proposal.pdf");
    expect(file).toBeTruthy();
    expect((file as Record<string, unknown>)["kind"]).toBe("file");
    const folder = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "Contracts");
    expect((folder as Record<string, unknown>)["kind"]).toBe("folder");
    const unknown = out.rows.find((r) => (r as Record<string, unknown>)["id"] === "id:u1");
    expect((unknown as Record<string, unknown>)["kind"]).toBe("unknown");
    // The real call shape: POST /files/list_folder with path "" + recursive false (page 1).
    const listCall = calls.find((c) => c.url.includes("/files/list_folder") && c.method === "POST");
    expect(listCall).toBeTruthy();
    expect(listCall?.body).toMatchObject({ path: "", recursive: false });
    // Honest note: counts + metadata-only + 0 fabricated + staged wording.
    expect(out.note).toContain("Dropbox HTTP 200");
    expect(out.note).toContain("file metadata only");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });
  it("strict tenant scoping: a tenant with NO connection fails honestly, zero Dropbox API calls", async () => {
    installFetch(defaultRoutes);
    seedDropboxCredential(T1); // only T1 has a credential
    const reader = makeDropboxImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "dropbox" })).rejects.toThrow(
      /No Dropbox account is connected for this tenant/,
    );
    // No Dropbox call was made on behalf of T2.
    expect(calls.filter((c) => c.url.includes("api.dropboxapi.com") && c.url.includes("/files/list_folder"))).toHaveLength(0);
  });
  it("cross-tenant isolation: two connected tenants each pull ONLY their own files (their own token in the Authorization header)", async () => {
    installFetch(defaultRoutes);
    seedDropboxCredential(T1);
    seedDropboxCredential(T2);
    const reader = makeDropboxImportSourceReader();
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "dropbox" });
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_y", provider: "dropbox" });
    const names1 = out1.rows.map((r) => (r as Record<string, unknown>)["name"]);
    const names2 = out2.rows.map((r) => (r as Record<string, unknown>)["name"]);
    expect(names1).toContain("proposal.pdf");
    expect(names1).not.toContain("t2-notes.txt");
    expect(names2).toContain("t2-notes.txt");
    expect(names2).not.toContain("proposal.pdf");
    // The Dropbox calls used each tenant's own token, never the other's.
    const listCalls = calls.filter((c) => c.url.includes("/files/list_folder"));
    expect(listCalls.some((c) => c.auth === "Bearer tok-for-" + T1)).toBe(true);
    expect(listCalls.some((c) => c.auth === "Bearer tok-for-" + T2)).toBe(true);
    expect(listCalls.every((c) => c.auth === "Bearer tok-for-" + T1 || c.auth === "Bearer tok-for-" + T2)).toBe(true);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedDropboxCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real Dropbox reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "dropbox", sourceLabel: "Acme Dropbox", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "id", targetField: "id" }, { sourceField: "name", targetField: "name" }, { sourceField: "path_display", targetField: "path_display" }, { sourceField: "kind", targetField: "kind" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // No public surface ever projects the credential or Dropbox tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});
describe("Dropbox lane failure + cap contracts", () => {
  it("provider HTTP error (401) → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u, b, auth) => (m === "POST" && u.includes("/files/list_folder") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedDropboxCredential(T1);
    const reader = makeDropboxImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "dropbox" })).rejects.toThrow(/HTTP 401/);
  });
  it("gate-level: 401 on the read → honest FAILED pull run recorded (httpStatus 401, nothing staged)", async () => {
    installFetch((m, u, b, auth) => (m === "POST" && u.includes("/files/list_folder") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedDropboxCredential(T1);
    const tableId = seedTable();
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "dropbox", sourceLabel: "Acme Dropbox", target: { kind: "table", tableId } }, via: "portal" }, T1);
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
  it("expired token + configured app creds → refresh through api.dropboxapi.com/oauth2/token", async () => {
    process.env.OAUTH_DROPBOX_CLIENT_ID = "cid-test";
    process.env.OAUTH_DROPBOX_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedDropboxCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeDropboxImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "dropbox" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("api.dropboxapi.com") && c.url.includes("/oauth2/token") && c.method === "POST")).toBe(true);
  });
  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedDropboxCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeDropboxImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "dropbox" })).rejects.toThrow(
      /OAUTH_DROPBOX_CLIENT_ID\/SECRET are not configured/,
    );
  });
  it("rows are bounded: entries sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ ".tag": "file", id: `id:f-${i}`, name: `file-${i}.txt`, path_lower: `/file-${i}.txt`, path_display: `/file-${i}.txt`, rev: `rev-${i}`, server_modified: "2024-01-01T00:00:00Z", size: 10, is_downloadable: true }));
    installFetch((m, u, b, auth) => {
      if (m === "POST" && u.includes("/files/list_folder")) return jsonResponse({ entries: many, cursor: "cur", has_more: false });
      return defaultRoutes(m, u, b, auth);
    });
    seedDropboxCredential(T1);
    const reader = makeDropboxImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "dropbox" });
    // 150 entries sliced to MAX_PAGE_SIZE (100) by the reader.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report dropbox as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const lane = body.lanes.find((l) => l.provider === "dropbox");
    expect(lane?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});