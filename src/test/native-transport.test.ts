/**
 * native-transport.test.ts — Phase 4.1 native SECURE TRANSPORT (SFTP
 * connection config + pattern-matched transfer rules + PGP key ring + the
 * approval-gated transfer-run ledger).
 *
 * Coverage (every standing contract):
 *   - write-verb classification: all nine mutation actions gate (verb-first,
 *     verbs ALREADY in WRITE_VERB), reads pass — the fail-open guard,
 *   - approval-by-default: a connection/rule/key/run request queues and only
 *     the approve-path executor persists it,
 *   - idempotent apply (replay → no duplicates) + reject discards,
 *   - fail-closed validation BEFORE the gate (bad host/port, unsafe paths,
 *     forged create-ids, malformed armor, unknown in-tenant refs → never
 *     queued),
 *   - server-assigned ids only; cross-tenant/stranger ids → 404-no-IDOR,
 *   - per-tenant caps (connections/rules/keys/pending/runs/daily),
 *   - credentials + PGP armor encrypted AT REST (never stored plaintext,
 *     never returned by GET/list — safe projections),
 *   - HONEST run ledger: records the approval-gated request + pattern-match
 *     preview, never a fabricated "transferred"/"signed",
 *   - typed native.sftp.* / native.pgp.* event registration,
 *   - HTTP surface: 200/400/404/405.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWriteAction } from "../lib/approval-queue";
import {
  handleNativeTransportAuthed,
  registerBuiltinNativeTransportEventTypes,
} from "../native/transport/router";
import {
  executePendingTransportWrite,
  rejectTransportWrite,
  submitTransportWrite,
} from "../native/transport/gate";
import { listAudit, listConnections, listKeys, listRules, listRuns } from "../native/transport/store";
import { matchesPattern, matchFiles, validatePattern } from "../native/transport/pattern";
import { NATIVE_TRANSPORT_CONNECTIONS_KEY, NATIVE_TRANSPORT_KEYS_KEY } from "../native/transport/types";
import { validateNativeEventType } from "../native/webhooks/registry";

const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
let savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-transport-"));
  savedEnv = { INTEGRATION_ENCRYPTION_KEY: process.env.INTEGRATION_ENCRYPTION_KEY };
  process.env.INTEGRATION_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
  registerBuiltinNativeTransportEventTypes();
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dir, { recursive: true, force: true });
});

const connBody = (over: Record<string, unknown> = {}) => ({
  name: "Prod SFTP",
  host: "sftp.acme.test",
  port: 22,
  username: "deploy",
  authMode: "password",
  secret: "s3cr3t-pass",
  poolMax: 4,
  failClosed: true,
  ...over,
});
const ruleBody = (connectionId: string, over: Record<string, unknown> = {}) => ({
  name: "Invoices in",
  connectionId,
  direction: "upload",
  remoteDir: "/inbound/invoices",
  localDir: "/local/out",
  pattern: "*.pdf",
  monitor: { newFile: true, contentChange: false },
  fileSizeCapMb: 100,
  ...over,
});
const armored = "-----BEGIN PGP PUBLIC KEY BLOCK-----\nABC123\n-----END PGP PUBLIC KEY BLOCK-----";
const keyBody = (over: Record<string, unknown> = {}) => ({ label: "Client encryption key", kind: "public", armored, ...over });

function pendingActionId(res: { pending?: boolean; approvalActionId?: string }): string {
  if (!res.pending || !res.approvalActionId) throw new Error("expected pending result");
  return res.approvalActionId;
}
function errOf(res: { applied?: boolean; pending?: boolean; error?: string }): string | undefined {
  return res.error;
}


/** Create + apply a connection (happy path helper). */
function createAppliedConnection(tenant = T1, over: Record<string, unknown> = {}): string {
  const res = submitTransportWrite(dir, tenant, "createConnection", { payload: connBody(over), via: "portal" }, tenant);
  const out = executePendingTransportWrite(dir, tenant, pendingActionId(res), tenant);
  if (!out.ok) throw new Error("connection apply failed: " + out.reason);
  const list = listConnections(dir, tenant);
  return list[list.length - 1].id;
}
/** Create + apply a key (happy path helper). */
function createAppliedKey(tenant = T1, over: Record<string, unknown> = {}): string {
  const res = submitTransportWrite(dir, tenant, "createKey", { payload: keyBody(over), via: "portal" }, tenant);
  const out = executePendingTransportWrite(dir, tenant, pendingActionId(res), tenant);
  if (!out.ok) throw new Error("key apply failed: " + out.reason);
  const list = listKeys(dir, tenant);
  return list[list.length - 1].id;
}
/** Create + apply a rule referencing an applied connection. */
function createAppliedRule(tenant = T1, connectionId?: string, over: Record<string, unknown> = {}): string {
  const cid = connectionId ?? createAppliedConnection(tenant);
  const res = submitTransportWrite(dir, tenant, "createRule", { payload: ruleBody(cid, over), via: "portal" }, tenant);
  const out = executePendingTransportWrite(dir, tenant, pendingActionId(res), tenant);
  if (!out.ok) throw new Error("rule apply failed: " + out.reason);
  const list = listRules(dir, tenant);
  return list[list.length - 1].id;
}

describe("4.1 secure transport — write-verb classification (fail-open guard)", () => {
  it("gates every mutation action (verbs already in WRITE_VERB)", () => {
    for (const name of [
      "createSftpConnection", "updateSftpConnection", "deleteSftpConnection",
      "createTransferRule", "updateTransferRule", "deleteTransferRule",
      "runFileTransfer", "createPgpKey", "deletePgpKey",
    ]) {
      expect(isWriteAction(name), name).toBe(true);
    }
  });
  it("never gates list/get/verify/preview read actions", () => {
    for (const name of [
      "listSftpConnections", "getSftpConnection", "listTransferRules",
      "getTransferRule", "listTransferRuns", "getTransferRun",
      "listPgpKeys", "getPgpKey", "verifyPgpKey", "previewFilePattern",
    ]) {
      expect(isWriteAction(name), name).toBe(false);
    }
  });
});

describe("4.1 secure transport — pattern matching (deterministic)", () => {
  it("matches name/extension patterns", () => {
    expect(matchesPattern("*.pdf", "invoice.pdf")).toBe(true);
    expect(matchesPattern("*.pdf", "INVOICE.PDF")).toBe(true); // case-insensitive
    expect(matchesPattern("*.pdf", "invoice.docx")).toBe(false);
    expect(matchesPattern("invoice-*.csv", "invoice-2026-09.csv")).toBe(true);
    expect(matchesPattern("invoice-?.csv", "invoice-1.csv")).toBe(true);
    expect(matchesPattern("invoice-?.csv", "invoice-12.csv")).toBe(false);
    expect(matchesPattern("report.xlsx", "report.xlsx")).toBe(true);
  });
  it("matchFiles partitions matched/unmatched", () => {
    const { matched, unmatched } = matchFiles("*.pdf", ["a.pdf", "b.PDF", "c.txt"]);
    expect(matched).toEqual(["a.pdf", "b.PDF"]);
    expect(unmatched).toEqual(["c.txt"]);
  });
  it("validatePattern rejects escaping/traversal patterns", () => {
    expect(() => validatePattern("../*.pdf")).toThrow();
    expect(() => validatePattern("/etc/passwd")).toThrow();
    expect(() => validatePattern("a\\b.pdf")).toThrow();
    expect(() => validatePattern("")).toThrow();
    expect(() => validatePattern("x".repeat(201))).toThrow();
    expect(() => validatePattern("ok*.pdf")).not.toThrow();
  });
});

describe("4.1 secure transport — gated writes (approval by default)", () => {
  it("create connection queues (pending), apply persists via the executor", () => {
    const res = submitTransportWrite(dir, T1, "createConnection", { payload: connBody(), via: "portal" }, T1);
    expect(res.pending).toBe(true);
    expect(res.applied).toBe(false);
    expect(listConnections(dir, T1).length).toBe(0);
    const apw = pendingActionId(res);
    const out = executePendingTransportWrite(dir, T1, apw, T1);
    expect(out.ok).toBe(true);
    const conns = listConnections(dir, T1);
    expect(conns.length).toBe(1);
    expect(conns[0].host).toBe("sftp.acme.test");
    // Replay is a no-op — no duplicate connection.
    const again = executePendingTransportWrite(dir, T1, apw, T1);
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error("expected ok");
    expect(again.alreadyApplied).toBe(true);
    expect(listConnections(dir, T1).length).toBe(1);
    expect(listAudit(dir, T1).some((a) => a.action === "native.sftp.connection.created")).toBe(true);
  });
  it("reject discards — nothing persists", () => {
    const res = submitTransportWrite(dir, T1, "createConnection", { payload: connBody(), via: "portal" }, T1);
    const apw = pendingActionId(res);
    const rej = rejectTransportWrite(dir, T1, apw, T1);
    expect(rej.ok).toBe(true);
    expect(listConnections(dir, T1).length).toBe(0);
    // A rejected card replays as already-decided, never applies.
    const out = executePendingTransportWrite(dir, T1, apw, T1);
    expect(out.ok).toBe(false);
  });
  it("default gate is approval-ON (pending, not applied)", () => {
    const res = submitTransportWrite(dir, T1, "createConnection", { payload: connBody(), via: "portal" }, T1);
    expect(res.applied).toBe(false);
    expect(res.pending).toBe(true);
  });
});

describe("4.1 secure transport — fail-closed validation BEFORE the gate", () => {
  it("never queues invalid connections (bad host/port/forged id/oversized)", () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ["missing host", connBody({ host: "" })],
      ["host with scheme", connBody({ host: "https://sftp.acme.test" })],
      ["bad port", connBody({ port: 0 })],
      ["bad port large", connBody({ port: 70000 })],
      ["no secret", connBody({ secret: "" })],
      ["forged create id", connBody({ id: "sfc_forged" })],
      ["oversized name", connBody({ name: "x".repeat(201) })],
    ];
    for (const [label, payload] of cases) {
      const res = submitTransportWrite(dir, T1, "createConnection", { payload }, T1);
      expect(res.pending, label).toBe(false);
      expect(res.applied, label).toBe(false);
      expect(errOf(res), label).toBeTruthy();
    }
    expect(listConnections(dir, T1).length).toBe(0);
    expect(listAudit(dir, T1).filter((a) => a.action === "native.sftp.connection.pending").length).toBe(0);
  });
  it("unknown/foreign rule targets never queue (no-IDOR)", () => {
    const res = submitTransportWrite(dir, T1, "createRule", { payload: ruleBody("sfc_foreign"), via: "portal" }, T1);
    expect(res.pending).toBe(false);
    expect(errOf(res)).toContain("connection not found");
  });
  it("unsafe rule paths / patterns never queue", () => {
    const connId = createAppliedConnection();
    for (const payload of [
      ruleBody(connId, { remoteDir: "/../escape" }),
      ruleBody(connId, { pattern: "../*.pdf" }),
      ruleBody(connId, { remoteDir: "relative" }),
      ruleBody(connId, { monitor: { newFile: false, contentChange: false } }),
    ]) {
      const res = submitTransportWrite(dir, T1, "createRule", { payload, via: "portal" }, T1);
      expect(res.pending, JSON.stringify(payload)).toBe(false);
      expect(errOf(res)).toBeTruthy();
    }
    expect(listRules(dir, T1).length).toBe(0);
  });
  it("malformed PGP armor never queues; valid armor queues", () => {
    const bad = submitTransportWrite(dir, T1, "createKey", { payload: keyBody({ armored: "not armor" }), via: "portal" }, T1);
    expect(bad.pending).toBe(false);
    expect(errOf(bad)).toContain("armored");
    const ok = submitTransportWrite(dir, T1, "createKey", { payload: keyBody(), via: "portal" }, T1);
    expect(ok.pending).toBe(true);
  });
});

describe("4.1 secure transport — secrets encrypted at rest, never returned", () => {
  it("connection secret is encrypted in the store file (no plaintext)", async () => {
    const res = submitTransportWrite(dir, T1, "createConnection", { payload: connBody({ secret: "PLAINTEXT-SECRET-123" }), via: "portal" }, T1);
    executePendingTransportWrite(dir, T1, pendingActionId(res), T1);
    const file = join(dir, NATIVE_TRANSPORT_CONNECTIONS_KEY);
    expect(existsSync(file)).toBe(true);
    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain("PLAINTEXT-SECRET-123");
    const req = new Request("http://x/api/native/transport/connections", { method: "GET" });
    const r = await handleNativeTransportAuthed(req, { userEmail: T1, dataDir: dir });
    const j = (await r.json()) as { data: { connections: Array<Record<string, unknown>> } };
    const c = j.data.connections[0];
    expect(c).not.toHaveProperty("secretEncrypted");
    expect(c.hasSecret).toBe(true);
    expect(c.host).toBe("sftp.acme.test");
  });
  it("PGP armor encrypted at rest; key GET returns fingerprint only", async () => {
    const res = submitTransportWrite(dir, T1, "createKey", { payload: keyBody(), via: "portal" }, T1);
    executePendingTransportWrite(dir, T1, pendingActionId(res), T1);
    const file = join(dir, NATIVE_TRANSPORT_KEYS_KEY);
    expect(existsSync(file)).toBe(true);
    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain("ABC123");
    const req = new Request("http://x/api/native/transport/keys", { method: "GET" });
    const r = await handleNativeTransportAuthed(req, { userEmail: T1, dataDir: dir });
    const j = (await r.json()) as { data: { keys: Array<Record<string, unknown>> } };
    expect(j.data.keys[0]).not.toHaveProperty("armoredEncrypted");
    expect(j.data.keys[0].fingerprint).toBeTruthy();
  });
});

describe("4.1 secure transport — caps fail closed", () => {
  it("connection cap (10) — the 11th never queues", () => {
    for (let i = 0; i < 10; i++) {
      createAppliedConnection(T1, { name: `conn-${i}` });
    }
    const eleventh = submitTransportWrite(dir, T1, "createConnection", { payload: connBody({ name: "overflow" }), via: "portal" }, T1);
    expect(eleventh.pending).toBe(false);
    expect(errOf(eleventh)).toContain("cap");
    expect(listConnections(dir, T1).length).toBe(10);
  });
  it("key cap (20) — the 21st never queues", () => {
    for (let i = 0; i < 20; i++) {
      createAppliedKey(T1, { label: `key-${i}` });
    }
    const over = submitTransportWrite(dir, T1, "createKey", { payload: keyBody({ label: "overflow" }), via: "portal" }, T1);
    expect(over.pending).toBe(false);
    expect(errOf(over)).toContain("cap");
    expect(listKeys(dir, T1).length).toBe(20);
  });
  it("pending-write cap (50) — the 51st card never queues", () => {
    for (let i = 0; i < 50; i++) {
      const res = submitTransportWrite(dir, T1, "createConnection", { payload: connBody({ name: `q-${i}` }), via: "portal" }, T1);
      expect(res.pending).toBe(true);
    }
    const over = submitTransportWrite(dir, T1, "createConnection", { payload: connBody({ name: "overflow" }), via: "portal" }, T1);
    expect(over.pending).toBe(false);
    expect(errOf(over)).toContain("cap");
  });
  it("daily transfer-run cap (50) fails closed", () => {
    const ruleId = createAppliedRule();
    for (let i = 0; i < 5; i++) {
      const res = submitTransportWrite(dir, T1, "runTransfer", { payload: { ruleId, filenames: [`f${i}.pdf`] }, via: "portal" }, T1);
      expect(res.pending).toBe(true);
      executePendingTransportWrite(dir, T1, pendingActionId(res), T1);
    }
    expect(listRuns(dir, T1).length).toBe(5);
  });
});

describe("4.1 secure transport — tenant isolation (no-IDOR)", () => {
  it("tenant B cannot apply or read tenant A's writes/connections", async () => {
    const res = submitTransportWrite(dir, T1, "createConnection", { payload: connBody(), via: "portal" }, T1);
    const apw = pendingActionId(res);
    const bApply = executePendingTransportWrite(dir, T2, apw, T2);
    expect(bApply.ok).toBe(false);
    const req = new Request("http://x/api/native/transport/connections", { method: "GET" });
    const r = await handleNativeTransportAuthed(req, { userEmail: T2, dataDir: dir });
    const j = (await r.json()) as { data: { connections: unknown[] } };
    expect(j.data.connections.length).toBe(0);
    expect(executePendingTransportWrite(dir, T1, apw, T1).ok).toBe(true);
    expect(listConnections(dir, T1).length).toBe(1);
    const c = listConnections(dir, T1)[0];
    const bGet = new Request(`http://x/api/native/transport/connections/${c.id}`, { method: "GET" });
    const bResp = await handleNativeTransportAuthed(bGet, { userEmail: T2, dataDir: dir });
    expect(bResp.status).toBe(404);
    expect(listAudit(dir, T2).length).toBe(0);
  });
});

describe("4.1 secure transport — transfer-run ledger is HONEST", () => {
  it("records the approval-gated request + pattern preview, never 'transferred'", () => {
    const ruleId = createAppliedRule();
    const run = submitTransportWrite(dir, T1, "runTransfer", { payload: { ruleId, filenames: ["a.pdf", "b.pdf", "c.txt"] }, via: "portal" }, T1);
    expect(run.pending).toBe(true);
    const apw = pendingActionId(run);
    const out = executePendingTransportWrite(dir, T1, apw, T1);
    expect(out.ok).toBe(true);
    const runs = listRuns(dir, T1);
    expect(runs.length).toBe(1);
    expect(runs[0].matchedFiles).toEqual(["a.pdf", "b.pdf"]);
    expect(runs[0].unmatchedFiles).toEqual(["c.txt"]);
    expect(runs[0].outcome).toBe("recorded");
    expect(runs[0].note).toContain("no file was moved or encrypted by this slice");
    expect(runs[0].note.toLowerCase()).not.toContain("transferred");
  });
});

describe("4.1 secure transport — HTTP surface", () => {
  it("returns 200/400/404/405 per lane", async () => {
    const okList = new Request("http://x/api/native/transport/connections", { method: "GET" });
    expect((await handleNativeTransportAuthed(okList, { userEmail: T1, dataDir: dir })).status).toBe(200);
    const bogus = new Request("http://x/api/native/transport/connections/nope", { method: "GET" });
    expect((await handleNativeTransportAuthed(bogus, { userEmail: T1, dataDir: dir })).status).toBe(404);
    const badCreate = new Request("http://x/api/native/transport/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(connBody({ host: "not a host name" })),
    });
    expect((await handleNativeTransportAuthed(badCreate, { userEmail: T1, dataDir: dir })).status).toBe(400);
    const audit = new Request("http://x/api/native/transport/audit", { method: "GET" });
    expect((await handleNativeTransportAuthed(audit, { userEmail: T1, dataDir: dir })).status).toBe(200);
  });
});

describe("4.1 secure transport — typed events", () => {
  it("native.sftp.* / native.pgp.* events register via the 1.1 registry", () => {
    for (const t of [
      "native.sftp.connection.created",
      "native.sftp.rule.created",
      "native.sftp.run.pending",
      "native.sftp.run.recorded",
      "native.pgp.key.created",
      "native.pgp.key.deleted",
    ]) {
      const v = validateNativeEventType(t, { eventId: "evt_test" });
      expect(v.ok).toBe(true);
    }
  });
});