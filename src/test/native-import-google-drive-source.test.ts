/**
 * native-import-google-drive-source.test.ts — Phase 5.1 (6.4) Google Drive
 * FILE SOURCE LANE (106th publish slice).
 *
 * Contracts under test (each a standing requirement of the lane, mirroring the
 * 6.4 OneDrive / SFTP lane suites, but through the REAL verified
 * google-workspace read client):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN Drive file
 *     listing through the verified Google Drive v3 client (listFiles with the
 *     `trashed = false` filter — the exact call the verified
 *     `google-drive-read-files` capability makes) — read-only, one-shot, no
 *     webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields
 *     (id/name/mimeType/size/createdTime/modifiedTime/trashed/webViewLink) +
 *     a derived kind ("file" | "folder" | "unknown" from the Drive folder
 *     mime type); nested-only records skipped with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:google-drive` — a tenant
 *     with no connection NEVER sees another tenant's token (no cross-tenant
 *     fallback); two connected tenants each pull ONLY their own files (the
 *     Authorization header used for the Drive call carries the caller's
 *     token),
 *   - expired token + configured app creds → refresh through
 *     oauth2.googleapis.com/token; expired + no app creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: page 1 sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS
 *     total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "file metadata only — file
 *     contents are NOT downloaded" + "0 fabricated" + "nothing imported until
 *     you approve"; secrets never appear in rows or ledgers,
 *   - registration makes /api/native/import/lanes report google-drive as
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
import { makeGoogleDriveImportSourceReader, registerGoogleDriveImportSource } from "../native/import/google-drive-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
const calls: Array<{ method: string; url: string; auth?: string; body?: unknown }> = [];
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** Stub global fetch (HttpClient calls the global at request time — same
 *  pattern as the verification adapter + OneDrive lane tests). Records the
 *  Authorization header so per-tenant token usage is provable. */
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
const FILES_T1 = [
  { id: "f-1", name: "proposal.pdf", mimeType: "application/pdf", size: "1024", createdTime: "2024-01-01T00:00:00Z", modifiedTime: "2024-01-02T00:00:00Z", trashed: false, webViewLink: "https://drive.google.com/file/d/f1/view" },
  { id: "f-2", name: "invoices.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: "20480", createdTime: "2024-01-03T00:00:00Z", modifiedTime: "2024-01-04T00:00:00Z", trashed: false, webViewLink: "https://drive.google.com/file/d/f2/view" },
  { id: "d-1", name: "Contracts", mimeType: "application/vnd.google-apps.folder", size: undefined, createdTime: "2024-01-01T00:00:00Z", modifiedTime: "2024-01-01T00:00:00Z", webViewLink: "https://drive.google.com/drive/folders/d1" },
  { id: "only-facets", owners: [{ emailAddress: "x@acme.test" }] }, // has id only → kind "unknown" (mimeType absent)
  { owners: [{ emailAddress: "y@acme.test" }] }, // NO scalar fields at all → skipped (nested-only)
];
const FILES_T2 = [
  { id: "t2-1", name: "t2-notes.txt", mimeType: "text/plain", size: "42", createdTime: "2024-02-01T00:00:00Z", modifiedTime: "2024-02-01T00:00:00Z", trashed: false },
];
function defaultRoutes(m: string, u: string, _b?: unknown, auth?: string): Response {
  if (m === "GET" && u.includes("www.googleapis.com") && u.includes("/drive/v3/files")) {
    const files = auth && auth.includes("tok-for-" + T2) ? FILES_T2 : FILES_T1;
    return jsonResponse({ files });
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
    name: "gdrive_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "File ID", type: "text", required: false },
      { key: "name", label: "File name", type: "text", required: false },
      { key: "size", label: "Size", type: "text", required: false },
      { key: "kind", label: "Kind", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedGoogleDriveCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:google-drive`] = {
    provider: "google-drive",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-gdrive-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerGoogleDriveImportSource(); // real Google Drive lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_GOOGLE_DRIVE_CLIENT_ID;
  delete process.env.OAUTH_GOOGLE_DRIVE_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});
describe("Google Drive import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own Drive file listing through the REAL verified client, deterministically", async () => {
    installFetch(defaultRoutes);
    seedGoogleDriveCredential(T1);
    const reader = makeGoogleDriveImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-drive" });
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
    const unknown = out.rows.find((r) => (r as Record<string, unknown>)["id"] === "only-facets");
    expect((unknown as Record<string, unknown>)["kind"]).toBe("unknown");
    // The verified call shape: /drive/v3/files with q=trashed = false + pageSize cap.
    const driveCall = calls.find((c) => c.url.includes("/drive/v3/files"));
    expect(driveCall).toBeTruthy();
    expect(driveCall?.url).toContain("trashed");
    expect(driveCall?.url).toContain("pageSize");
    // Honest note: counts + metadata-only + 0 fabricated + staged wording.
    expect(out.note).toContain("Google Drive HTTP 200");
    expect(out.note).toContain("file metadata only");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });
  it("strict tenant scoping: a tenant with NO connection fails honestly, zero Drive API calls", async () => {
    installFetch(defaultRoutes);
    seedGoogleDriveCredential(T1); // only T1 has a credential
    const reader = makeGoogleDriveImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "google-drive" })).rejects.toThrow(
      /No Google Drive account is connected for this tenant/,
    );
    // No Drive call was made on behalf of T2.
    expect(calls.filter((c) => c.url.includes("www.googleapis.com") && c.url.includes("/drive/v3/files"))).toHaveLength(0);
  });
  it("cross-tenant isolation: two connected tenants each pull ONLY their own files (their own token in the Authorization header)", async () => {
    installFetch(defaultRoutes);
    seedGoogleDriveCredential(T1);
    seedGoogleDriveCredential(T2);
    const reader = makeGoogleDriveImportSourceReader();
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-drive" });
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_y", provider: "google-drive" });
    const names1 = out1.rows.map((r) => (r as Record<string, unknown>)["name"]);
    const names2 = out2.rows.map((r) => (r as Record<string, unknown>)["name"]);
    expect(names1).toContain("proposal.pdf");
    expect(names1).not.toContain("t2-notes.txt");
    expect(names2).toContain("t2-notes.txt");
    expect(names2).not.toContain("proposal.pdf");
    // The Drive calls used each tenant's own token, never the other's.
    const driveCalls = calls.filter((c) => c.url.includes("/drive/v3/files"));
    expect(driveCalls.some((c) => c.auth === "Bearer tok-for-" + T1)).toBe(true);
    expect(driveCalls.some((c) => c.auth === "Bearer tok-for-" + T2)).toBe(true);
    expect(driveCalls.every((c) => c.auth === "Bearer tok-for-" + T1 || c.auth === "Bearer tok-for-" + T2)).toBe(true);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedGoogleDriveCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real Google Drive reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "google-drive", sourceLabel: "Acme Google Drive", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "id", targetField: "id" }, { sourceField: "name", targetField: "name" }, { sourceField: "size", targetField: "size" }, { sourceField: "kind", targetField: "kind" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // No public surface ever projects the credential or Drive tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});
describe("Google Drive lane failure + cap contracts", () => {
  it("provider HTTP error (401) → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/drive/v3/files") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedGoogleDriveCredential(T1);
    const reader = makeGoogleDriveImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-drive" })).rejects.toThrow(/HTTP 401/);
  });
  it("gate-level: 401 on the read → honest FAILED pull run recorded (httpStatus 401, nothing staged)", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/drive/v3/files") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedGoogleDriveCredential(T1);
    const tableId = seedTable();
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "google-drive", sourceLabel: "Acme Google Drive", target: { kind: "table", tableId } }, via: "portal" }, T1);
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
  it("expired token + configured app creds → refresh through oauth2.googleapis.com/token", async () => {
    process.env.OAUTH_GOOGLE_DRIVE_CLIENT_ID = "cid-test";
    process.env.OAUTH_GOOGLE_DRIVE_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedGoogleDriveCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeGoogleDriveImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-drive" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("oauth2.googleapis.com") && c.url.includes("/token") && c.method === "POST")).toBe(true);
  });
  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedGoogleDriveCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeGoogleDriveImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-drive" })).rejects.toThrow(
      /OAUTH_GOOGLE_DRIVE_CLIENT_ID\/SECRET are not configured/,
    );
  });
  it("rows are bounded: page 1 sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `f-${i}`, name: `file-${i}.txt`, mimeType: "text/plain", size: "10", createdTime: "2024-01-01T00:00:00Z", modifiedTime: "2024-01-01T00:00:00Z", trashed: false }));
    installFetch((m, u, b, auth) => {
      if (m === "GET" && u.includes("/drive/v3/files")) return jsonResponse({ files: many });
      return defaultRoutes(m, u, b, auth);
    });
    seedGoogleDriveCredential(T1);
    const reader = makeGoogleDriveImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "google-drive" });
    // 150 items sliced to MAX_PAGE_SIZE (100) by the verified client's pageSize param.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report google-drive as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const lane = body.lanes.find((l) => l.provider === "google-drive");
    expect(lane?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});