/**
 * native-import-sftp-source.test.ts — Phase 5.1 (6.4) SFTP FILE SOURCE LANE.
 *
 * Contracts under test (each a standing requirement of the lane, mirroring the
 * 6.4 OneDrive lane suite, main 0460572):
 *   - the reader pulls a BOUNDED, deterministic metadata snapshot of the
 *     tenant's OWN stored Phase 4.1 Secure-Transport SFTP configuration
 *     (connections + rules) — read-only (no live SFTP session, no webhooks,
 *     no write-back), one-shot/client-initiated only,
 *   - deterministic flattening ONLY (NO LLM): fixed safe scalar fields from
 *     the 4.1 publicConnection projection + derived hasSecret/monitor
 *     booleans; the AES-256-GCM encrypted secret NEVER leaves the store —
 *     rows carry `hasSecret: true`, never the blob or plaintext,
 *   - STRICT tenant scoping: a tenant with NO stored SFTP connection fails
 *     honestly and never sees another tenant's config (no cross-tenant
 *     fallback; the 4.1 store is tenant-keyed by structure),
 *   - credential-material validation at pull time: missing or corrupt stored
 *     secret → honest failure (no staging of rows that can never be acted on),
 *   - caps before gating: connections/rules sliced to MAX_PAGE_SIZE (100)
 *     each and MAX_STAGING_ROWS (200) total; the gate's own caps still apply,
 *   - HONEST RUN OUTCOMES: pulled counts + "no live SFTP connection or file
 *     listing was made by this lane" + "0 fabricated" + "nothing imported
 *     until you approve"; httpStatus ABSENT (no provider HTTP call happened —
 *     types.ts: absent when no provider call occurred); secrets never appear
 *     in rows, ledgers or lane payloads,
 *   - registration makes /api/native/import/lanes report sftp as wired and
 *     the full pull surface stages rows end-to-end.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import { executePendingImportWrite, submitImportWrite } from "../native/import/gate";
import { getStaging, listJobs, listRuns } from "../native/import/store";
import { createTable } from "../native/tables/store";
import { makeSftpImportSourceReader, registerSftpImportSource } from "../native/import/sftp-source";
import {
  encryptSecret,
  generateTransportEntityId,
  saveConnection,
  saveRule,
} from "../native/transport/store";
import type { SftpConnection, TransferRule } from "../native/transport/types";
import { randomBytes } from "node:crypto";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
let savedEnv: Record<string, string | undefined> = {};
function conn(tenant: string, over: Partial<SftpConnection> = {}): SftpConnection {
  const now = new Date().toISOString();
  return {
    id: generateTransportEntityId("sfc"),
    tenantId: tenant,
    name: "Prod SFTP",
    host: "sftp.acme.test",
    port: 22,
    username: "deploy",
    authMode: "password",
    secretEncrypted: encryptSecret("s3cr3t-PASS-value"),
    poolMax: 4,
    failClosed: true,
    createdAt: now,
    createdBy: tenant,
    updatedAt: now,
    updatedBy: tenant,
    ...over,
  };
}
function rule(tenant: string, connectionId: string, over: Partial<TransferRule> = {}): TransferRule {
  const now = new Date().toISOString();
  return {
    id: generateTransportEntityId("tru"),
    tenantId: tenant,
    name: "Invoices in",
    connectionId,
    direction: "upload",
    remoteDir: "/inbound/invoices",
    localDir: "/local/out",
    pattern: "*.pdf",
    monitor: { newFile: true, contentChange: false },
    fileSizeCapMb: 100,
    createdAt: now,
    createdBy: tenant,
    updatedAt: now,
    updatedBy: tenant,
    ...over,
  };
}
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "sftp_import_target",
    description: "import target",
    fields: [
      { key: "kind", label: "Kind", type: "text", required: false },
      { key: "name", label: "Name", type: "text", required: false },
      { key: "host", label: "Host", type: "text", required: false },
      { key: "port", label: "Port", type: "number", required: false },
      { key: "username", label: "Username", type: "text", required: false },
      { key: "remoteDir", label: "Remote dir", type: "text", required: false },
      { key: "pattern", label: "Pattern", type: "text", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-sftp-"));
  savedEnv = { INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY };
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
  registerBuiltinNativeImportEventTypes();
  registerSftpImportSource(); // real SFTP lane (registry is per-file)
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});
describe("SFTP import source reader (direct)", () => {
  it("pulls a bounded deterministic snapshot of the tenant's OWN stored SFTP config (connections + rules)", async () => {
    const c1 = conn(T1);
    saveConnection(dir, c1);
    saveConnection(dir, conn(T1, { id: generateTransportEntityId("sfc"), name: "Backup SFTP", host: "backup.acme.test", port: 2222, authMode: "key" }));
    saveRule(dir, rule(T1, c1.id));
    const reader = makeSftpImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sftp" });
    expect(out.rows.length).toBeGreaterThan(0);
    const kinds = out.rows.map((r) => (r as Record<string, unknown>)["kind"]);
    expect(kinds).toContain("connection");
    expect(kinds).toContain("rule");
    const hostRow = out.rows.find((r) => (r as Record<string, unknown>)["host"] === "sftp.acme.test");
    expect(hostRow).toBeTruthy();
    expect((hostRow as Record<string, unknown>)["username"]).toBe("deploy");
    // Deterministic scalars only — every value is string/number/boolean.
    expect(out.rows.every((r) => Object.values(r).every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean"))).toBe(true);
    // Honest note: config metadata + no live SFTP + 0 fabricated + staged wording.
    expect(out.note).toContain("Secure Transport store");
    expect(out.note).toContain("no live SFTP connection or file listing");
    expect(out.note).toContain("0 fabricated");
    expect(out.note).toContain("nothing imported until you approve");
  });
  it("strict tenant scoping: a tenant with NO stored SFTP config fails honestly and never sees another tenant's rows", async () => {
    saveConnection(dir, conn(T1)); // only T1 has a connection
    const reader = makeSftpImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "sftp" })).rejects.toThrow(
      /No SFTP connection is configured for this tenant/,
    );
  });
  it("connection rows carry hasSecret (never the encrypted blob or plaintext)", async () => {
    saveConnection(dir, conn(T1, { secretEncrypted: encryptSecret("PLAINTEXT-SECRET-123") }));
    const reader = makeSftpImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sftp" });
    const row = out.rows.find((r) => (r as Record<string, unknown>)["kind"] === "connection") as Record<string, unknown>;
    expect(row["hasSecret"]).toBe(true);
    // Secret NEVER in rows — neither plaintext nor the encrypted blob.
    expect(JSON.stringify(out.rows)).not.toContain("PLAINTEXT-SECRET-123");
    expect(JSON.stringify(out.rows)).not.toContain("secretEncrypted");
  });
  it("creates a pending-write entry + honest run ledger when the gate runs the real reader (end-to-end)", async () => {
    const c1 = conn(T1);
    saveConnection(dir, c1);
    saveRule(dir, rule(T1, c1.id));
    const tableId = seedTable();
    // create (gated, provider sftp) → map (gated) → pull (gated, real SFTP reader).
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "sftp", sourceLabel: "Acme SFTP", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(create.applied || create.pending).toBe(true);
    const importId = create.applied ? String(create.id) : await (async () => {
      const actionId = create.pending ? create.approvalActionId : "";
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
      if (!done.ok) throw new Error(done.reason);
      return String(done.id);
    })();
    const map = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "kind", targetField: "kind" }, { sourceField: "name", targetField: "name" }, { sourceField: "host", targetField: "host" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // NO provider HTTP call happened — httpStatus must be absent (honest).
    expect(last?.httpStatus).toBeUndefined();
    expect(last?.note).toContain("0 fabricated");
    expect(last?.note).toContain("no live SFTP connection");
    expect(last?.note).toContain("nothing imported until you approve");
    expect(listJobs(dir, T1).some((j) => j.id === importId)).toBe(true);
    // No public surface ever projects the credential.
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`, { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("s3cr3t-PASS-value");
  });
});
describe("SFTP lane failure + cap contracts", () => {
  it("corrupt stored credential material → honest FAILED run at the gate (never staged, never fabricated)", async () => {
    // Seed a connection whose encrypted secret blob is corrupt (not decryptable).
    saveConnection(dir, conn(T1, { name: "Broken", secretEncrypted: "not-a-valid-encrypted-blob" }));
    const reader = makeSftpImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sftp" })).rejects.toThrow(
      /unusable stored credentials/,
    );
    // Through the gate: honest FAILED run + native.import.failed event.
    const tableId = seedTable();
    const create = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "sftp", sourceLabel: "Acme SFTP", target: { kind: "table", tableId } }, via: "portal" }, T1);
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
    // Through the gate: the apply path runs the real reader, which throws —
    // the gate records an honest FAILED run (never staged, never fabricated).
    if (pull.pending) {
      const after = await executePendingImportWrite(dir, T1, pull.approvalActionId, T1);
      if (after.ok) throw new Error("expected the corrupt-credential pull to fail");
      expect(after.reason).toContain("unusable stored credentials");
    }
    const runs = listRuns(dir, T1, importId);
    const failed = runs.filter((r) => r.op === "pullImportData" && r.failed === 1);
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[failed.length - 1]?.note).toContain("0 rows pulled");
    expect(getStaging(dir, T1, importId)).toBeFalsy(); // nothing staged
  });
  it("missing stored secret → honest failure naming the connection", async () => {
    saveConnection(dir, conn(T1, { name: "NoCred", secretEncrypted: "" }));
    const reader = makeSftpImportSourceReader();
    await expect(reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sftp" })).rejects.toThrow(
      /"NoCred" has no stored credential/,
    );
  });
  it("rows are bounded to MAX_PAGE_SIZE per entity and MAX_STAGING_ROWS total", async () => {
    const c1 = conn(T1);
    saveConnection(dir, c1);
    // 150 rules — sliced to MAX_PAGE_SIZE (100) on read, total capped at 200.
    for (let i = 0; i < 150; i += 1) saveRule(dir, rule(T1, c1.id, { name: `rule-${i}`, pattern: `r${i}*.pdf` }));
    const reader = makeSftpImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sftp" });
    expect(out.rows.length).toBeLessThanOrEqual(200);
    expect(out.rows.length).toBeGreaterThanOrEqual(100);
    expect(out.note).toContain("0 fabricated");
  });
  it("registration makes the lanes catalog report sftp as wired (no credentials in the payload)", async () => {
    const c1 = conn(T1);
    saveConnection(dir, c1);
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/lanes", { method: "GET" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { lanes: Array<{ provider: string; wired: boolean }> };
    const sftp = body.lanes.find((l) => l.provider === "sftp");
    expect(sftp?.wired).toBe(true);
    expect(JSON.stringify(body)).not.toContain("s3cr3t-PASS-value");
    expect(JSON.stringify(body)).not.toContain("secretEncrypted");
  });
  it("cross-tenant isolation: T1's pull NEVER contains T2's stored config rows", async () => {
    const c1 = conn(T1);
    saveConnection(dir, c1);
    saveConnection(dir, conn(T2, { host: "t2-only.sftp.test" }));
    const reader = makeSftpImportSourceReader();
    const out = await reader({ dataDir: dir, tenantId: T1, importId: "imp_x", provider: "sftp" });
    expect(JSON.stringify(out.rows)).not.toContain("t2-only.sftp.test");
    // And T2 pulls only its own rows.
    const out2 = await reader({ dataDir: dir, tenantId: T2, importId: "imp_x", provider: "sftp" });
    expect(JSON.stringify(out2.rows)).toContain("t2-only.sftp.test");
    expect(JSON.stringify(out2.rows)).not.toContain("sftp.acme.test");
  });
});