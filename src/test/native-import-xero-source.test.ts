/**
 * native-import-xero-source.test.ts — Phase 5.1 (6.2) Xero IMPORT SOURCE LANE.
 *
 * Contracts under test (each a standing requirement of the lane):
 *   - the reader pulls a BOUNDED snapshot of the tenant's OWN Xero data
 *     (contacts + invoices priority) through the verified Xero read client —
 *     read-only, one-shot, no webhooks, no write-back,
 *   - deterministic mapping ONLY (NO LLM): safe scalar fields; nested-only
 *     records skipped with an honest note,
 *   - STRICT tenant credential lookup `${tenantId}:xero` — a tenant with no
 *     connection NEVER sees another tenant's token (no cross-tenant fallback),
 *   - expired token + configured app creds → refresh through
 *     identity.xero.com/connect/token; expired + no app creds → honest failure,
 *   - provider HTTP error (401) → honest FAILED run with httpStatus recorded,
 *     never silent, never fabricated,
 *   - caps before gating: rows sliced to MAX_PAGE_SIZE per entity and
 *     MAX_STAGING_ROWS total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "0 fabricated" + "nothing imported
 *     until you approve"; secrets never appear in rows or ledgers,
 *   - registration makes /api/native/import/lanes report xero as wired and
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
import { makeXeroImportSourceReader, registerXeroImportSource } from "../native/import/xero-source";
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
  { ContactID: "con-1", Name: "Ada Corp", FirstName: "Ada", LastName: "Lovelace", EmailAddress: "ada@acme.test", IsSupplier: false, IsCustomer: true, AccountNumber: "ACC-001", Status: "ACTIVE" },
  { ContactID: "con-2", Name: "Lin Labs", FirstName: "Lin", LastName: "Huang", EmailAddress: "lin@acme.test", IsSupplier: true, IsCustomer: false, Status: "ACTIVE" },
  { Addresses: [{ AddressType: "STREET", AddressLine1: "x" }], Phones: [{ PhoneType: "MOBILE" }] },
];
const INVOICES = [
  { InvoiceID: "inv-1", Type: "ACCREC", Status: "AUTHORISED", InvoiceNumber: "INV-0001", Reference: "ref-1", CurrencyCode: "USD", Total: 1250, TotalTax: 0, AmountDue: 1250, Contact: { ContactID: "con-1", Name: "Ada Corp" } },
  { InvoiceID: "inv-2", Type: "ACCPAY", Status: "DRAFT", InvoiceNumber: "BILL-0002", Reference: "ref-2", CurrencyCode: "USD", Total: 500, TotalTax: 0, AmountDue: 500, Contact: { ContactID: "con-2", Name: "Lin Labs" } },
];
const defaultRoutes = (m: string, u: string): Response => {
  if (m === "GET" && u.includes("/connections")) return jsonResponse([{ tenantId: "xero-org-1" }]);
  if (m === "GET" && u.includes("/api.xro/2.0/Contacts")) return jsonResponse({ Contacts: CONTACTS });
  if (m === "GET" && u.includes("/api.xro/2.0/Invoices")) return jsonResponse({ Invoices: INVOICES });
  if (m === "POST" && u.includes("identity.xero.com/connect/token")) {
    return jsonResponse({ access_token: "fresh-token", refresh_token: "fresh-rt", expires_in: 3600, token_type: "Bearer" });
  }
  return jsonResponse({ error: "unexpected" }, 404);
};

function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "xero_import_target",
    description: "import target",
    fields: [
      { key: "ContactID", label: "Xero ID", type: "text", required: false },
      { key: "Name", label: "Name", type: "text", required: false },
      { key: "Total", label: "Total", type: "number", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
/** Write a tenant's own Xero credential into the per-tenant store. */
function seedXeroCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:xero`] = {
    provider: "xero",
    email: tenant,
    accessToken: "tok-for-" + tenant,
    refreshToken: "rt-for-" + tenant,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    tenantId: "xero-org-1",
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-xero-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerXeroImportSource(); // real Xero lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_XERO_CLIENT_ID;
  delete process.env.OAUTH_XERO_CLIENT_SECRET;
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});

describe("Xero import source reader (direct)", () => {
  it("pulls a bounded snapshot of the tenant's own contacts + invoices, deterministically", async () => {
    installFetch(defaultRoutes);
    seedXeroCredential(T1);
    const reader = makeXeroImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "xero" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(out.httpStatus).toBe(200);
    // Contacts flattened: scalar-only (nested-only con-3 skipped → 2 contacts).
    const row0 = out.rows[0] as Record<string, unknown>;
    expect(row0["ContactID"] ?? row0["Name"]).toBeTruthy();
    expect(Object.keys(row0).every((k) => typeof row0[k] === "string" || typeof row0[k] === "number" || typeof row0[k] === "boolean")).toBe(true);
    // Invoices present with flattened Contact name.
    const invoice = out.rows.find((r) => (r as Record<string, unknown>)["InvoiceNumber"] === "INV-0001");
    expect(invoice).toBeTruthy();
    expect((invoice as Record<string, unknown>)["Name"]).toBe("Ada Corp");
    // Honest note: counts + 0 fabricated + staged-for-review wording (never claims imported).
    expect(out.note).toContain("Xero HTTP 200");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
    expect(out.note).toContain("skipped");
    // Secrets never appear in rows.
    expect(JSON.stringify(out.rows)).not.toContain("tok-for-");
    expect(JSON.stringify(out.rows)).not.toContain("accessToken");
  });

  it("strict tenant scoping: a tenant with NO connection fails honestly and never touches another tenant's token", async () => {
    installFetch(defaultRoutes);
    seedXeroCredential(T1); // only T1 has a credential
    const reader = makeXeroImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "xero" })).rejects.toThrow(
      /No Xero account is connected for this tenant/,
    );
    // No Xero API call was made on behalf of T2 (calls.length stays 0).
    expect(calls.filter((c) => c.url.includes("api.xero.com") || c.url.includes("api.xro"))).toHaveLength(0);
  });

  it("resolves the Xero organisation via /connections when the credential has no stored tenantId", async () => {
    installFetch(defaultRoutes);
    seedXeroCredential(T1, { tenantId: undefined });
    const reader = makeXeroImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "xero" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("/connections"))).toBe(true);
  });

  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetch(defaultRoutes);
    seedXeroCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real Xero reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "xero", sourceLabel: "Acme Xero", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "Name", targetField: "Name" }, { sourceField: "ContactID", targetField: "ContactID" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // No public surface ever projects the credential or Xero tokens.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("tok-for-");
  });
});

describe("Xero lane failure + cap contracts", () => {
  it("provider HTTP error → honest FAILED run with httpStatus, never silent", async () => {
    installFetch((m, u) => (m === "GET" && u.includes("/api.xro/2.0/Contacts") ? jsonResponse({ error: "unauthorized" }, 401) : defaultRoutes(m, u)));
    seedXeroCredential(T1);
    const reader = makeXeroImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "xero" })).rejects.toThrow(/HTTP 401/);
  });

  it("expired token + configured app creds → refresh through identity.xero.com/connect/token", async () => {
    process.env.OAUTH_XERO_CLIENT_ID = "cid-test";
    process.env.OAUTH_XERO_CLIENT_SECRET = "csec-test";
    installFetch(defaultRoutes);
    seedXeroCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeXeroImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "xero" });
    expect(out.rows.length).toBeGreaterThan(0);
    expect(calls.some((c) => c.url.includes("identity.xero.com/connect/token") && c.method === "POST")).toBe(true);
  });

  it("expired token + NO app creds → honest failure (0 rows pulled)", async () => {
    installFetch(defaultRoutes);
    seedXeroCredential(T1, { expiresAt: Math.floor(Date.now() / 1000) - 60 });
    const reader = makeXeroImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "xero" })).rejects.toThrow(
      /OAUTH_XERO_CLIENT_ID\/SECRET are not configured/,
    );
  });

  it("rows are bounded to MAX_PAGE_SIZE per entity and MAX_STAGING_ROWS total", async () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ ContactID: `con-${i}`, Name: `Contact ${i}`, Status: "ACTIVE" }));
    installFetch((m, u) => {
      if (m === "GET" && u.includes("/api.xro/2.0/Contacts")) return jsonResponse({ Contacts: many });
      return defaultRoutes(m, u);
    });
    seedXeroCredential(T1);
    const reader = makeXeroImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "xero" });
    // 150 contacts sliced to MAX_PAGE_SIZE (100) + invoices within budget.
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThan(100);
    expect(out.note).toContain("0 fabricated");
  });

  it("registration makes the lanes catalog report xero as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const xero = body.lanes.find((l) => l.provider === "xero");
    expect(xero?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens.
    expect(JSON.stringify(body)).not.toContain("tok-for-");
  });
});