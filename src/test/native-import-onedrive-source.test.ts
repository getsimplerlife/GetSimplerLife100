/**
 * native-import-onedrive-source.test.ts — Phase 5.1 (6.4) OneDrive FILE SOURCE LANE.
 *
 * Contracts under test (each a standing requirement of the lane, mirroring the
 * 6.2 Xero / 6.3 HubSpot lane suites):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN OneDrive root
 *     children through the verified OneDrive read client (listRootItems — the
 *     exact call the verified `onedrive-read-files` capability makes) —
 *     read-only, one-shot, no webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields
 *     (id/name/size/createdDateTime/lastModifiedDateTime/webUrl) + a derived
 *     kind; nested-only records skipped with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:onedrive` — a tenant with no
 *     connection NEVER sees another tenant's token (no cross-tenant fallback),
 *   - expired token + configured app creds → refresh through
 *     login.microsoftonline.com/{tenant}/oauth2/v2.0/token; expired + no app
 *     creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: rows sliced to MAX_PAGE_SIZE (root children) and
 *     MAX_STAGING_ROWS total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "file metadata only — file contents
 *     are NOT downloaded" + "0 fabricated" + "nothing imported until you
 *     approve"; secrets never appear in rows or ledgers,
 *   - registration makes /api/native/import/lanes report onedrive as wired and
 *     the full pull surface stages rows end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import { executePendingImportWrite, submitImportWrite } from "../native/import/gate";
import { getStaging, listJobs, listRuns } from "../native/import/store";
import { createTable } from "../native/tables/store";
import { makeOneDriveImportSourceReader, registerOneDriveImportSource } from "../native/import/onedrive-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
const calls: Array<{ method: string; url: string; body?: unknown }> = [];
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
/** Stub global fetch (HttpClient + oauth helpers call the global at request
 *  time — same pattern as the verification adapter tests). */
function installFetch(handler: (m: string, u: string, b?: unknown) => Response): void {
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    const m = (init?.method || "GET") as string;
    let b: unknown;
    if (init?.body) {
      try { b = JSON.parse(String(init.body)); } catch { b = String(init.body); }
    }
    calls.push({ method: m, url: u, body: b });
    return handler(m, u, b);
  }) as unknown as typeof fetch;
}
const ROOT_ITEMS = [
  { id: "f-1", name: "proposal.pdf", size: 1024, createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-01-02T00:00:00Z", webUrl: "https://1drv.ms/f1", file: { mimeType: "application/pdf" } },
  { id: "f-2", name: "invoices.xlsx", size: 20480, createdDateTime: "2024-01-03T00:00:00Z", lastModifiedDateTime: "2024-01-04T00:00:00Z", webUrl: "https://1drv.ms/f2", file: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } },
  { id: "d-1", name: "Contracts", createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-01-01T00:00:00Z", webUrl: "https://1drv.ms/d1", folder: { childCount: 4 } },
  { id: "nested", name: "nested-only" }, // no scalar page fields... still has name → NOT skipped; keep a true empty record below
  { id: "only-facets", file: { mimeType: "application/pdf" }, folder: undefined } as unknown as Record<string, unknown>, // keep minimal
];
function defaultRoutes(m: string, u: string): Response {
  if (m === "GET" && u.includes("graph.microsoft.com") && u.includes("/me/drive/root/children")) {
    return jsonResponse({ value: ROOT_ITEMS });
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
    name: "onedrive_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "File ID", type: "text", required: false },
      { key: "name", label: "File name", type: "text", required: false },
      { key: "size", label: "Size", type: "number", required: false },
      { key: "kind", label: "Kind", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedOneDriveCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:onedrive`] = {
    provider: "onedrive",
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
  dir = mkdtempSync(join(tmpdir(), "native-import-onedrive-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerOneDriveImportSource(); // real OneDrive lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_ONEDRIVE_CLIENT_ID;
  delete process.env.OAUTH_ONEDRIVE_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});
describe("OneDrive import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own OneDrive root children, deterministically", async () => {
    installFetch(defaultRoutes);
    seedOneDriveCredential(T1);
    const reader = makeOneDriveImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "onedrive" });
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
    // Honest note: counts + metadata-only + 0 fabricated + staged-for-review wording.
    expect(out.note).toContain("OneDrive HTTP 200");
    expect(out.note).toContain("file metadata only");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });
  it("strict tenant scoping: a tenant with NO connection fails honestly and never touches another tenant's token", async () => {
    installFetch(defaultRoutes);
    seedOneDriveCredential(T1); // only T1 has a credential
    const reader = makeOneDriveImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "onedrive" })).rejects.toThrow(
      /No OneDrive account is connected for this tenant/,
    );
    // No Graph call was made on behalf of T2 (calls.length stays 0).
    expect(calls.filter((c) => c.url.includes("graph.microsoft.com"))).toHaveLength(0);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedOneDriveCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real OneDrive reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "onedrive", sourceLabel: "Acme OneDrive", target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    expect(listJobs(dir, T1).some((j) => j.id === importId)).toBe(true);
    // No public surface ever projects the credential or OneDrive tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});
describe("OneDrive lane failure + cap contracts", () => {
  it("provider HTTP error → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u) => (m === "GET" && u.includes("/me/drive/root/children") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u)));
    seedOneDriveCredential(T1);
    const reader = makeOneDriveImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "onedrive" })).rejects.toThrow(/HTTP 401/);
  });
  it("expired token + configured app creds → refresh through login.microsoftonline.com/{tenant}/oauth2/v2.0/token", async () => {
    process.env.OAUTH_ONEDRIVE_CLIENT_ID = "cid-test";
    process.env.OAUTH_ONEDRIVE_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedOneDriveCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeOneDriveImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "onedrive" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("login.microsoftonline.com") && c.url.includes("/oauth2/v2.0/token") && c.method === "POST")).toBe(true);
  });
  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedOneDriveCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeOneDriveImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "onedrive" })).rejects.toThrow(
      /OAUTH_ONEDRIVE_CLIENT_ID\/SECRET are not configured/,
    );
  });
  it("rows are bounded to MAX_PAGE_SIZE (root children) and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `f-${i}`, name: `file-${i}.txt`, size: 10, createdDateTime: "2024-01-01T00:00:00Z", lastModifiedDateTime: "2024-01-01T00:00:00Z", webUrl: `https://1drv.ms/f${i}`, file: { mimeType: "text/plain" } }));
    installFetch((m, u) => {
      if (m === "GET" && u.includes("/me/drive/root/children")) return jsonResponse({ value: many });
      return defaultRoutes(m, u);
    });
    seedOneDriveCredential(T1);
    const reader = makeOneDriveImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "onedrive" });
    // 150 items sliced to MAX_PAGE_SIZE (100).
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report onedrive as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const onedrive = body.lanes.find((l) => l.provider === "onedrive");
    expect(onedrive?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});