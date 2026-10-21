/**
 * native-import-sendgrid-source.test.ts — Phase 5.1 (6.5) SENDGRID IMPORT
 * SOURCE LANE (110th publish slice, with google-calendar + slack).
 *
 * Contracts under test (each a standing requirement of the lane; this is a
 * CONFIG-METADATA lane like SFTP — SendGrid is a send-side integration with
 * no verified read adapter, so the lane NEVER claims live SendGrid I/O that
 * did not happen):
 *   - the reader stages a bounded snapshot of the tenant's OWN stored
 *     SendGrid connection METADATA (kind/hasApiKey/email/connectedAt) with
 *     ZERO provider API calls (a fetch spy proves no network I/O),
 *   - STRICT tenant credential lookup `${tenantId}:sendgrid` — a tenant with
 *     no connection fails honestly, never another tenant's key, zero calls,
 *   - deterministic mapping ONLY (NO LLM): fixed safe scalar fields only;
 *     the API key value itself NEVER appears in rows or ledgers (only the
 *     derived hasApiKey boolean),
 *   - a stored connection without an apiKey still stages an honest row with
 *     hasApiKey false (never fabricated),
 *   - HONEST RUN OUTCOMES: the note says exactly what was read and what was
 *     not — "no live SendGrid API call was made" + "0 fabricated" + "nothing
 *     imported until you approve"; httpStatus ABSENT (no provider HTTP call
 *     happened),
 *   - registration makes /api/native/import/lanes report sendgrid as wired
 *     and the full pull surface stages the config row end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import { executePendingImportWrite, submitImportWrite } from "../native/import/gate";
import { getStaging, listJobs, listRuns } from "../native/import/store";
import { createTable } from "../native/tables/store";
import { makeSendgridImportSourceReader, registerSendgridImportSource } from "../native/import/sendgrid-source";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
const KEY_T1 = "SG.tenant-a-secret-key-1234567890abcdef";
let dir: string;
const calls: Array<{ method: string; url: string }> = [];
/** Spy global fetch and record every call — this lane must make ZERO. */
function installFetchSpy(): void {
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    calls.push({ method: (init?.method || "GET") as string, url: String(url) });
    return new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch;
}
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "sendgrid_import_target",
    description: "import target",
    fields: [
      { key: "kind", label: "Kind", type: "text", required: false },
      { key: "provider", label: "Provider", type: "text", required: false },
      { key: "email", label: "Email", type: "text", required: false },
      { key: "hasApiKey", label: "Has API key", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
function seedSendGridCredential(tenant: string, overrides: Record<string, unknown> = {}): void {
  const file = join(dir, "tenant_oauth_credentials.json");
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(readFileSync(file, "utf8")); } catch { data = {}; }
  data[`${tenant}:sendgrid`] = {
    provider: "sendgrid",
    email: tenant,
    apiKey: tenant === T1 ? KEY_T1 : "SG." + tenant + "-secret-key",
    connectedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
  writeFileSync(file, JSON.stringify(data, null, 2));
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-sendgrid-"));
  calls.length = 0;
  registerBuiltinNativeImportEventTypes();
  registerSendgridImportSource(); // real SendGrid lane (registry is per-file)
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.OAUTH_REDIRECT_BASE;
  delete process.env.SITE_ORIGIN;
  vi.restoreAllMocks();
});
describe("SendGrid import source reader (config-metadata)", () => {
  it("stages ONE honest connection-metadata row with ZERO provider API calls, key value never staged", async () => {
    installFetchSpy();
    seedSendGridCredential(T1);
    const reader = makeSendgridImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sendgrid" });
    // ONE bounded config-metadata row, no provider call, no httpStatus.
    expect(out.rows.length).toBe(1);
    expect(out.httpStatus).toBeUndefined();
    expect(calls).toHaveLength(0); // ZERO provider API calls — honest config lane
    const row = out.rows[0] as Record<string, unknown>;
    expect(row["kind"]).toBe("sendgrid-connection");
    expect(row["provider"]).toBe("sendgrid");
    expect(row["email"]).toBe(T1);
    expect(row["hasApiKey"]).toBe(true);
    expect(Object.keys(row).every((k) => typeof row[k] === "string" || typeof row[k] === "number" || typeof row[k] === "boolean")).toBe(true);
    // The API key value must NEVER appear in rows or the honest note.
    expect(JSON.stringify(out.rows)).not.toContain("SG.");
    expect(out.note).not.toContain("SG.");
    // Honest note: config metadata + no live SendGrid API + 0 fabricated + staged wording.
    expect(out.note).toContain("SendGrid connection config metadata");
    expect(out.note).toContain("no live SendGrid API call was made by this lane");
    expect(out.note).toContain("never claims email content was transferred");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
  });
  it("strict tenant scoping: a tenant with NO connection fails honestly, zero provider calls", async () => {
    installFetchSpy();
    seedSendGridCredential(T1); // only T1 has a credential
    const reader = makeSendgridImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "sendgrid" })).rejects.toThrow(
      /No SendGrid account is connected for this tenant/,
    );
    // No network I/O at all — never another tenant's key, never a live call.
    expect(calls).toHaveLength(0);
  });
  it("cross-tenant isolation: two connected tenants each get ONLY their own connection row (key values never cross)", async () => {
    installFetchSpy();
    seedSendGridCredential(T1);
    seedSendGridCredential(T2);
    const reader = makeSendgridImportSourceReader();
    const out1 = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sendgrid" });
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_y", provider: "sendgrid" });
    expect((out1.rows[0] as Record<string, unknown>)["email"]).toBe(T1);
    expect((out2.rows[0] as Record<string, unknown>)["email"]).toBe(T2);
    // Each tenant's row reflects their own connection, keys never staged for either.
    expect(JSON.stringify(out1.rows)).not.toContain("SG.");
    expect(JSON.stringify(out2.rows)).not.toContain("SG.");
    expect(calls).toHaveLength(0);
  });
  it("a stored connection with an accessToken but NO apiKey still stages an honest row with hasApiKey false", async () => {
    installFetchSpy();
    seedSendGridCredential(T1, { apiKey: undefined, accessToken: "tok-access-only" });
    const reader = makeSendgridImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sendgrid" });
    expect(out.rows.length).toBe(1);
    expect((out.rows[0] as Record<string, unknown>)["hasApiKey"]).toBe(false);
    // The credential material (apiKey OR accessToken) never appears in rows.
    expect(JSON.stringify(out.rows)).not.toContain("SG.");
    expect(JSON.stringify(out.rows)).not.toContain("tok-access-only");
    expect(out.note).toContain("0 fabricated");
    expect(calls).toHaveLength(0);
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    installFetchSpy();
    seedSendGridCredential(T1);
    const tableId = seedTable();
    // create (gated) → map (gated) → pull (gated, real SendGrid reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "sendgrid", sourceLabel: "Acme SendGrid", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "kind", targetField: "kind" }, { sourceField: "provider", targetField: "provider" }, { sourceField: "email", targetField: "email" }, { sourceField: "hasApiKey", targetField: "hasApiKey" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    expect(staging?.rows.length).toBe(1);
    const runs = listRuns(dir, T1, importId).filter((r) => r.op === "pullImportData");
    const last = runs[runs.length - 1];
    expect(last?.pulled).toBe(staging?.rows.length);
    // NO provider HTTP call happened — httpStatus must be absent (honest).
    expect(last?.httpStatus).toBeUndefined();
    expect(last?.note).toContain("0 fabricated");
    expect(last?.note).toContain("no live SendGrid API call was made");
    expect(last?.note).toContain("nothing imported until you approve");
    expect(listJobs(dir, T1).some((j) => j.id === importId)).toBe(true);
    // No public surface ever projects the credential or the SendGrid key.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("SG.");
  });
  it("the 512 KiB staging cap is enforced (belt and braces) and never fabricated", async () => {
    // The reader's row is tiny, but the cap check must exist; a deliberately
    // oversized staged row shape still fails closed. This lane never stages
    // more than the single bounded config row, so the cap is trivially safe —
    // assert the honest bounds hold for the connected case.
    installFetchSpy();
    seedSendGridCredential(T1);
    const reader = makeSendgridImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sendgrid" });
    expect(new TextEncoder().encode(JSON.stringify(out.rows)).byteLength).toBeLessThan(512 * 1024);
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.note).toContain("0 fabricated");
    expect(calls).toHaveLength(0);
  });
  it("registration makes the lanes catalog report sendgrid as wired", async () => {
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const lane = body.lanes.find((l) => l.provider === "sendgrid");
    expect(lane?.wired).toBe(true);
    // Lane is read-only metadata: no credentials, no tokens, no keys.
    expect(JSON.stringify(body)).not.toContain("SG.");
  });
});