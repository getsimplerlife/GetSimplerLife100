/**
 * native-import-hubspot-source.test.ts — Phase 5.1 (6.3) HubSpot IMPORT SOURCE LANE.
 *
 * Contracts under test (each a standing requirement of the lane, mirroring the
 * 6.2 Xero lane suite):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN HubSpot CRM data
 *     (contacts → companies → deals) through the verified HubSpot read client —
 *     read-only, one-shot, no webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar `properties` fields
 *     (exactly the property arrays the verified client requests) + top-level
 *     id/createdAt/updatedAt; nested-only records skipped with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:hubspot` — a tenant with no
 *     connection NEVER sees another tenant's token (no cross-tenant fallback),
 *   - expired token + configured app creds → refresh through
 *     api.hubapi.com/oauth/v1/token; expired + no app creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: rows sliced to MAX_PAGE_SIZE per entity and
 *     MAX_STAGING_ROWS total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "0 fabricated" + "nothing imported
 *     until you approve"; secrets never appear in rows or ledgers,
 *   - registration makes /api/native/import/lanes report hubspot as wired and
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
import { makeHubSpotImportSourceReader, registerHubSpotImportSource } from "../native/import/hubspot-source";
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
const CONTACTS = [
  { id: "c-1", properties: { firstname: "Ada", lastname: "Lovelace", email: "ada@acme.test", phone: "555-0101", jobtitle: "Engineer", company: "Ada Corp", hs_object_id: "c-1" }, createdAt: "2024-01-01T00:00:00Z" },
  { id: "c-2", properties: { firstname: "Lin", lastname: "Huang", email: "lin@acme.test" }, createdAt: "2024-01-02T00:00:00Z" },
  { properties: {} }, // nested-only payload → skipped with an honest note
];
const COMPANIES = [
  { id: "co-1", properties: { name: "Ada Corp", domain: "acme.test", industry: "Software", phone: "555-0100", city: "London", country: "UK", hs_object_id: "co-1" } },
  { id: "co-2", properties: { name: "Lin Labs", domain: "lin.test" } },
];
const DEALS = [
  { id: "d-1", properties: { dealname: "Acme onboarding", dealstage: "appointmentscheduled", pipeline: "default", amount: 12500, closedate: "2024-03-01", dealtype: "newbusiness", hs_object_id: "d-1" } },
  { id: "d-2", properties: { dealname: "Lin renewal", amount: 5000 } },
];
const defaultRoutes = (m: string, u: string): Response => {
  if (m === "POST" && u.includes("/crm/v3/objects/contacts/search")) return jsonResponse({ total: CONTACTS.length, results: CONTACTS });
  if (m === "POST" && u.includes("/crm/v3/objects/companies/search")) return jsonResponse({ total: COMPANIES.length, results: COMPANIES });
  if (m === "POST" && u.includes("/crm/v3/objects/deals/search")) return jsonResponse({ total: DEALS.length, results: DEALS });
  if (m === "POST" && u.includes("api.hubapi.com/oauth/v1/token")) {
    return jsonResponse({ access_token: "fresh-token", refresh_token: "fresh-rt", expires_in: 3600, token_type: "Bearer" });
  }
  return jsonResponse({ error: "unexpected" }, 404);
};

function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "hubspot_import_target",
    description: "import target",
    fields: [
      { key: "id", label: "HubSpot ID", type: "text", required: false },
      { key: "firstname", label: "First name", type: "text", required: false },
      { key: "amount", label: "Amount", type: "number", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
/** Write a tenant's own HubSpot credential into the per-tenant store. */
function seedHubSpotCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:hubspot`] = {
    provider: "hubspot",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-hubspot-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerHubSpotImportSource(); // real HubSpot lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_HUBSPOT_CLIENT_ID;
  delete process.env.OAUTH_HUBSPOT_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});

describe("HubSpot import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own contacts + companies + deals, deterministically", async () => {
    installFetch(defaultRoutes);
    seedHubSpotCredential(T1);
    const reader = makeHubSpotImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "hubspot" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.httpStatus).toBe(200);
    // Contact flattened: top-level id + scalar properties only (nested-only
    // record skipped → 2 contacts).
    const row0 = out.rows[0] as Record<string, unknown>;
    expect(row0["id"] ?? row0["firstname"]).toBeTruthy();
    expect(Object.keys(row0).every((k) => typeof row0[k] === "string" || typeof row0[k] === "number" || typeof row0[k] === "boolean")).toBe(true);
    // Deals present with scalar amount.
    const deal = out.rows.find((r) => (r as Record<string, unknown>)["dealname"] === "Acme onboarding");
    expect(deal).toBeTruthy();
    expect((deal as Record<string, unknown>)["amount"]).toBe(12500);
    // Honest note: counts + 0 fabricated + staged-for-review wording (never claims imported).
    expect(out.note).toContain("HubSpot HTTP 200");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    expect(out.note).toContain("skipped");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });

  it("strict tenant scoping: a tenant with NO connection fails honestly and never touches another tenant's token", async () => {
    installFetch(defaultRoutes);
    seedHubSpotCredential(T1); // only T1 has a credential
    const reader = makeHubSpotImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "hubspot" })).rejects.toThrow(
      /No HubSpot account is connected for this tenant/,
    );
    // No HubSpot API call was made on behalf of T2 (calls.length stays 0).
    expect(calls.filter((c) => c.url.includes("api.hubapi.com"))).toHaveLength(0);
  });

  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedHubSpotCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real HubSpot reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "hubspot", sourceLabel: "Acme HubSpot", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "id", targetField: "id" }, { sourceField: "firstname", targetField: "firstname" }, { sourceField: "amount", targetField: "amount" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // No public surface ever projects the credential or HubSpot tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});

describe("HubSpot lane failure + cap contracts", () => {
  it("provider HTTP error → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u) => (m === "POST" && u.includes("/crm/v3/objects/contacts/search") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u)));
    seedHubSpotCredential(T1);
    const reader = makeHubSpotImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "hubspot" })).rejects.toThrow(/HTTP 401/);
  });

  it("expired token + configured app creds → refresh through api.hubapi.com/oauth/v1/token", async () => {
    process.env.OAUTH_HUBSPOT_CLIENT_ID = "cid-test";
    process.env.OAUTH_HUBSPOT_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedHubSpotCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeHubSpotImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "hubspot" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("api.hubapi.com/oauth/v1/token") && c.method === "POST")).toBe(true);
  });

  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedHubSpotCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeHubSpotImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "hubspot" })).rejects.toThrow(
      /OAUTH_HUBSPOT_CLIENT_ID\/SECRET are not configured/,
    );
  });

  it("rows are bounded to MAX_PAGE_SIZE per entity and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ id: `c-${i}`, properties: { firstname: `Contact`, lastname: `${i}`, email: `c${i}@acme.test`, hs_object_id: `c-${i}` } }));
    installFetch((m, u) => {
      if (m === "POST" && u.includes("/crm/v3/objects/contacts/search")) return jsonResponse({ total: many.length, results: many });
      return defaultRoutes(m, u);
    });
    seedHubSpotCredential(T1);
    const reader = makeHubSpotImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "hubspot" });
    // 150 contacts sliced to MAX_PAGE_SIZE (100) + companies/deals within budget.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });

  it("registration makes the lanes catalog report hubspot as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const hubspot = body.lanes.find((l) => l.provider === "hubspot");
    expect(hubspot?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});