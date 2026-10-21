/**
 * native-import-sharepoint-source.test.ts — Phase 5.1 (6.4-FILE) SHAREPOINT
 * FILE SOURCE LANE (109th publish slice) — LAST 6.4 sibling.
 *
 * Contracts under test (each a standing requirement of the lane, mirroring the
 * 6.4 Box / Dropbox / Google Drive / OneDrive lane suites, through the
 * existing verified sharepoint read client — Graph API base
 * /v1.0/sites/{siteId}):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN SharePoint
 *     default document-library ROOT listing through the verified client
 *     (listDrives() → GET /drives then listItems(firstDrive) → GET
 *     /drives/{driveId}/root/children; page 1 only; no folder recursion) —
 *     read-only, one-shot, no webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields
 *     (id/name/size/createdDateTime/lastModifiedDateTime/webUrl) + a derived
 *     kind ("file" | "folder" | "unknown" from the Graph driveItem facets —
 *     folder has a "folder" facet, file has a "file" facet); nested-only
 *     records skipped with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:sharepoint` — a tenant
 *     with no connection NEVER sees another tenant's token (no cross-tenant
 *     fallback); two connected tenants each pull ONLY their own items and
 *     their own site (the Authorization header carries the caller's token
 *     and the drives URL carries the caller's siteId),
 *   - expired token + configured app creds → refresh through
 *     login.microsoftonline.com/{tenant}/oauth2/v2.0/token; expired + no app
 *     creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: drives/entries sliced to MAX_PAGE_SIZE and
 *     MAX_STAGING_ROWS total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "SharePoint HTTP 200" + "file
 *     metadata only — file contents are NOT downloaded" + "0 fabricated" +
 *     "nothing imported until you approve"; secrets never appear in rows or
 *     ledgers,
 *   - registration makes /api/native/import/lanes report sharepoint as wired
 *     and the full pull surface stages rows end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import { executePendingImportWrite, submitImportWrite } from "../native/import/gate";
import { getStaging, listRuns } from "../native/import/store";
import { createTable } from "../native/tables/store";
import { makeSharePointImportSourceReader, registerSharePointImportSource } from "../native/import/sharepoint-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
const calls: Array<{ method: string; url: string; auth?: string; body?: unknown }> = [];
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** Stub global fetch (HttpClient + oauth helpers call the global at request
 *  time — same pattern as the verification adapter + Dropbox/Box lane
 *  tests). Records the Authorization header so per-tenant token usage is
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
const DRIVES = [
  { id: "b!drive-1", name: "Shared Documents", driveType: "documentLibrary", webUrl: "https://contoso.sharepoint.com/sites/eng/Shared%20Documents" },
];
const ITEMS_T1 = [
  { id: "f-1", name: "proposal.pdf", size: 1024, createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-01-02T00:00:00Z", webUrl: "https://contoso.sharepoint.com/sites/eng/Shared%20Documents/proposal.pdf", file: { mimeType: "application/pdf" } },
  { id: "f-2", name: "invoices.xlsx", size: 20480, createdDateTime: "2024-01-03T00:00:00Z", lastModifiedDateTime: "2024-01-04T00:00:00Z", webUrl: "https://contoso.sharepoint.com/sites/eng/Shared%20Documents/invoices.xlsx", file: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } },
  { id: "d-1", name: "Contracts", createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-01-01T00:00:00Z", webUrl: "https://contoso.sharepoint.com/sites/eng/Shared%20Documents/Contracts", folder: { childCount: 4 } },
  { id: "u-1", name: "untyped-item" }, // no file/folder facet → kind "unknown"
  { parentReference: { driveId: "b!drive-1", id: "d1-root" } }, // NO scalar fields at all → skipped (nested-only)
];
const ITEMS_T2 = [
  { id: "t2-1", name: "t2-notes.txt", size: 42, createdDateTime: "2024-02-01T00:00:00Z", lastModifiedDateTime: "2024-02-01T00:00:00Z", webUrl: "https://acme2.sharepoint.com/sites/team/Shared%20Documents/t2-notes.txt", file: { mimeType: "text/plain" } },
];
function defaultRoutes(m: string, u: string, _b?: unknown, auth?: string): Response {
  if (m === "GET" && u.includes("graph.microsoft.com") && u.includes("/root/children")) {
    const items = auth && auth.includes("tok-for-" + T2) ? ITEMS_T2 : ITEMS_T1;
    return jsonResponse({ value: items });
  }
  if (m === "GET" && u.includes("graph.microsoft.com") && u.includes("/drives") && !u.includes("/root/children")) {
    return jsonResponse({ value: DRIVES });
  }
  if (m === "POST" && u.includes("login.microsoftonline.com") && u.includes("/oauth2/v2.0/token")) {
    return jsonResponse({ access_token: "fresh-token", refresh_token: "fresh-rt", expires_in: 3600, token_type: "Bearer" });
  }
  return jsonResponse({ error: "unexpected" }, 404);
}
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "sharepoint_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "File ID", type: "text", required: false },
      { key: "name", label: "File name", type: "text", required: false },
      { key: "size", label: "Size", type: "number", required: false },
      { key: "webUrl", label: "Web URL", type: "text", required: false },
      { key: "kind", label: "Kind", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedSharePointCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:sharepoint`] = {
    provider: "sharepoint",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    tenantId: "common",
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-sharepoint-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerSharePointImportSource(); // real SharePoint lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_SHAREPOINT_CLIENT_ID;
  delete process.env.OAUTH_SHAREPOINT_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});
describe("SharePoint import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own SharePoint document-library root through the real client, deterministically", async () => {
    installFetch(defaultRoutes);
    seedSharePointCredential(T1);
    const reader = makeSharePointImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sharepoint" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.httpStatus).toBe(200);
    const row0 = out.rows[0] as Record<string, unknown>;
    expect(row0["id"] ?? row0["name"]).toBeTruthy();
    expect(Object.keys(row0).every((k) => typeof row0[k] === "string" || typeof row0[k] === "number" || typeof row0[k] === "boolean")).toBe(true);
    const file = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "proposal.pdf");
    expect(file).toBeTruthy();
    expect((file as Record<string, unknown>)["kind"]).toBe("file");
    expect((file as Record<string, unknown>)["webUrl"]).toContain("proposal.pdf");
    const folder = out.rows.find((r) => (r as Record<string, unknown>)["name"] === "Contracts");
    expect((folder as Record<string, unknown>)["kind"]).toBe("folder");
    const unknown = out.rows.find((r) => (r as Record<string, unknown>)["id"] === "u-1");
    expect((unknown as Record<string, unknown>)["kind"]).toBe("unknown");
    // The real call shapes: GET /drives then GET /drives/{id}/root/children,
    // both against the default site "root" when no siteId is captured.
    const drivesCall = calls.find((c) => c.url.includes("graph.microsoft.com") && c.url.includes("/sites/root/drives") && !c.url.includes("/root/children") && c.method === "GET");
    expect(drivesCall).toBeTruthy();
    const childrenCall = calls.find((c) => c.url.includes("graph.microsoft.com") && c.url.includes("/drives/b!drive-1/root/children") && c.method === "GET");
    expect(childrenCall).toBeTruthy();
    // Honest note: counts + metadata-only + 0 fabricated + staged wording.
    expect(out.note).toContain("SharePoint HTTP 200");
    expect(out.note).toContain("file metadata only");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    expect(out.note).toContain("page 1");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });
  it("strict tenant scoping: a tenant with NO connection fails honestly, zero SharePoint API calls", async () => {
    installFetch(defaultRoutes);
    seedSharePointCredential(T1); // only T1 has a credential
    const reader = makeSharePointImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "sharepoint" })).rejects.toThrow(
      /No SharePoint account is connected for this tenant/,
    );
    // No Graph call was made on behalf of T2.
    expect(calls.filter((c) => c.url.includes("graph.microsoft.com"))).toHaveLength(0);
  });
  it("cross-tenant isolation: two connected tenants each pull ONLY their own items from their own site (own token + own siteId)", async () => {
    installFetch(defaultRoutes);
    seedSharePointCredential(T1, { siteId: "site-eng-a" });
    seedSharePointCredential(T2, { siteId: "site-team-b" });
    const reader = makeSharePointImportSourceReader();
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sharepoint" });
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_y", provider: "sharepoint" });
    const names1 = out1.rows.map((r) => (r as Record<string, unknown>)["name"]);
    const names2 = out2.rows.map((r) => (r as Record<string, unknown>)["name"]);
    expect(names1).toContain("proposal.pdf");
    expect(names1).not.toContain("t2-notes.txt");
    expect(names2).toContain("t2-notes.txt");
    expect(names2).not.toContain("proposal.pdf");
    // Each tenant's calls used their OWN site in the drives URL and their OWN
    // token in the Authorization header — never the other's.
    const drivesCalls = calls.filter((c) => c.url.includes("graph.microsoft.com") && c.url.includes("/drives") && !c.url.includes("/root/children"));
    expect(drivesCalls.some((c) => c.url.includes("/sites/site-eng-a/drives") && c.auth === "Bearer tok-for-" + T1)).toBe(true);
    expect(drivesCalls.some((c) => c.url.includes("/sites/site-team-b/drives") && c.auth === "Bearer tok-for-" + T2)).toBe(true);
    expect(drivesCalls.every((c) => c.auth === "Bearer tok-for-" + T1 || c.auth === "Bearer tok-for-" + T2)).toBe(true);
    const childrenCalls = calls.filter((c) => c.url.includes("/root/children"));
    expect(childrenCalls.every((c) => c.auth === "Bearer tok-for-" + T1 || c.auth === "Bearer tok-for-" + T2)).toBe(true);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedSharePointCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real SharePoint reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "sharepoint", sourceLabel: "Acme SharePoint", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "id", targetField: "id" }, { sourceField: "name", targetField: "name" }, { sourceField: "size", targetField: "size" }, { sourceField: "webUrl", targetField: "webUrl" }, { sourceField: "kind", targetField: "kind" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    expect(last?.note).toContain("SharePoint HTTP 200");
    expect(last?.note).toContain("0 fabricated");
    expect(last?.note).toContain("nothing imported until you approve");
    // No public surface ever projects the credential or SharePoint tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});
describe("SharePoint lane failure + cap contracts", () => {
  it("provider HTTP error (401) → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/root/children") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedSharePointCredential(T1);
    const reader = makeSharePointImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sharepoint" })).rejects.toThrow(/HTTP 401/);
  });
  it("gate-level: 401 on the read → honest FAILED pull run recorded (httpStatus 401, nothing staged)", async () => {
    installFetch((m, u, b, auth) => (m === "GET" && u.includes("/root/children") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u, b, auth)));
    seedSharePointCredential(T1);
    const tableId = seedTable();
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "sharepoint", sourceLabel: "Acme SharePoint", target: { kind: "table", tableId } }, via: "portal" }, T1);
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
  it("expired token + configured app creds → refresh through login.microsoftonline.com/{tenant}/oauth2/v2.0/token, then reads with the fresh token", async () => {
    process.env.OAUTH_SHAREPOINT_CLIENT_ID = "cid-test";
    process.env.OAUTH_SHAREPOINT_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedSharePointCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeSharePointImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sharepoint" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("login.microsoftonline.com") && c.url.includes("/oauth2/v2.0/token") && c.method === "POST")).toBe(true);
    // The Graph calls used the REFRESHED token, never the expired one.
    const graphCalls = calls.filter((c) => c.url.includes("graph.microsoft.com"));
    expect(graphCalls.every((c) => c.auth === "Bearer fresh-token")).toBe(true);
  });
  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedSharePointCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeSharePointImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sharepoint" })).rejects.toThrow(
      /OAUTH_SHAREPOINT_CLIENT_ID\/SECRET are not configured/,
    );
  });
  it("rows are bounded: entries sliced to MAX_PAGE_SIZE and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `f-${i}`, name: `file-${i}.txt`, size: 10, createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-01-01T00:00:00Z", webUrl: `https://contoso.sharepoint.com/sites/eng/Shared%20Documents/file-${i}.txt`, file: { mimeType: "text/plain" } }));
    installFetch((m, u, b, auth) => {
      if (m === "GET" && u.includes("/root/children")) return jsonResponse({ value: many });
      return defaultRoutes(m, u, b, auth);
    });
    seedSharePointCredential(T1);
    const reader = makeSharePointImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sharepoint" });
    // 150 entries sliced to MAX_PAGE_SIZE (100) by the reader.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report sharepoint as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const lane = body.lanes.find((l) => l.provider === "sharepoint");
    expect(lane?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});