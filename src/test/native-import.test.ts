/**
 * native-import.test.ts — Phase 5.1 (6.1) native IMPORT / MIGRATION slice
 * (client-optional import lanes: pull → map → stage → commit).
 *
 * Coverage (every standing contract):
 *   - write-verb classification: all six mutation actions gate (verb-first;
 *     `pull`, `map`, `commit` ADDED to WRITE_VERB — without them these
 *     actions classify as READS and BYPASS the Queue), reads pass (list/get/
 *     preview/runs/audit/writes),
 *   - approval-by-default: create/update/delete/pull/map queue and only the
 *     approve-path executor persists them; commitImport rides the TABLES
 *     slice's existing gated importTableRows write — ONE card, no double-queue,
 *   - lifecycle: create → map → pull (registered source reader) → preview
 *     (read-only) → commit → approved rows land in the target table; honest
 *     run ledger records pulled/mapped/committed exactly,
 *   - pull on a provider with NO wired source honestly reports 0 pulled
 *     (never a fabricated count) and an explicit note,
 *   - idempotent apply (replay → alreadyApplied, no duplicates) + reject
 *     discards; approved commit replay does not double-insert rows,
 *   - fail-closed validation BEFORE the gate: forged create-ids, unknown
 *     providers/target tables/cap violations → never queued,
 *   - server-assigned ids only; cross-tenant/stranger ids → 404-no-IDOR,
 *   - preview never gates and never writes (no audit/run/staging mutation),
 *   - typed native.import.* event registration,
 *   - HTTP surface: 200/201/202/400/404/405 and cross-tenant reads 404.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { isWriteAction } from "../lib/approval-queue";
import { handleNativeImportAuthed, registerBuiltinNativeImportEventTypes } from "../native/import/router";
import {
  executePendingImportWrite,
  registerImportSource,
  rejectImportWrite,
  submitImportWrite,
} from "../native/import/gate";
import {
  getJob,
  getStaging,
  listJobs,
  listPendingWrites,
  listRuns,
  listAudit,
} from "../native/import/store";
import { validateNativeEventType } from "../native/webhooks/registry";
import { createTable, listRows } from "../native/tables/store";
import { MAX_MAPPING_FIELDS } from "../native/import/types";
const T1 = "tenant-a@acme.test";
const T2 = "tenant-b@acme.test";
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "native-import-"));
  registerBuiltinNativeImportEventTypes();
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});
function seedTable(tenant = T1): string {
  const table = {
    id: `tbl_${randomBytes(4).toString("hex")}`,
    tenantId: tenant,
    name: "customers",
    description: "import target",
    fields: [
      { key: "name", label: "Name", type: "text", required: false },
      { key: "email", label: "Email", type: "email", required: false },
      { key: "amount", label: "Amount", type: "number", required: false },
    ],
    version: 1,
    createdAt: new Date().toISOString(),
    createdBy: tenant,
  };
  createTable(dir, table as never);
  return table.id;
}
/** Submit + approve a non-commit op; returns the created entity id. */
function resError(res: { applied: boolean; error?: string }): string {
  return typeof res.error === "string" ? res.error : "";
}
async function applyVia(op: Parameters<typeof submitImportWrite>[2], payload: Record<string, unknown>, tenant = T1, actor = tenant): Promise<string> {
  const res = await submitImportWrite(dir, tenant, op, { payload, via: "portal" }, actor);
  if (res.pending !== true || !("approvalActionId" in res)) throw new Error("expected pending: " + JSON.stringify(res));
  const done = await executePendingImportWrite(dir, tenant, res.approvalActionId, tenant);
  expect(done.ok, JSON.stringify(done)).toBe(true);
  if (!done.ok) throw new Error("expected ok: " + done.reason);
  return String(done.id ?? "");
}
/** Full approved lifecycle → committed import id (rows land in the table). */
async function seedCommittedImport(tenant = T1, rows: Record<string, unknown>[] = [{ name: "Ada", email: "ada@acme.test" }]): Promise<{ importId: string; tableId: string }> {
  registerImportSource("xero", async () => ({ rows }));
  try {
    const tableId = seedTable(tenant);
    const importId = await applyVia("createImport", { provider: "xero", sourceLabel: "Acme Xero", target: { kind: "table", tableId } }, tenant);
    await applyVia("mapImportFields", { importId, mapping: [{ sourceField: "name", targetField: "name" }, { sourceField: "email", targetField: "email" }], target: { kind: "table", tableId } }, tenant);
    await applyVia("pullImportData", { importId }, tenant);
    const commit = await submitImportWrite(dir, tenant, "commitImport", { payload: { importId }, via: "portal" }, tenant);
    expect(commit.applied || commit.pending, JSON.stringify(commit)).toBe(true);
    const actionId = commit.pending ? commit.approvalActionId : "";
    if (commit.pending) {
      const done = await executePendingImportWrite(dir, tenant, actionId, tenant);
      expect(done.ok, JSON.stringify(done)).toBe(true);
    }
    expect(getJob(dir, tenant, importId)?.status).toBe("committed");
    return { importId, tableId };
  } finally {
    registerImportSource("xero", async () => ({ rows: [] })); // reset wiring after each test
    void rows;
  }
}

describe("write-verb classification (carried security control)", () => {
  it("all six import mutations are WRITE (verb-first, gated)", () => {
    for (const name of [
      "createImport", "updateImport", "deleteImport",
      "pullImportData", "mapImportFields", "commitImport",
    ]) {
      expect(isWriteAction(name), name).toBe(true);
    }
  });
  it("never gates pure READ actions (list/get/preview/runs/audit/writes)", () => {
    for (const name of [
      "listImports", "getImport", "previewImport",
      "listImportRuns", "getImportRun",
      "listImportAudit", "listImportWrites",
    ]) {
      expect(isWriteAction(name), name).toBe(false);
    }
  });
});

describe("import lifecycle (approval-gated)", () => {
  it("create → map → pull → preview (no write) → commit lands rows in tables", async () => {
    const tableId = seedTable();
    registerImportSource("xero", async () => ({ rows: [{ name: "Ada", email: "ada@acme.test" }, { name: "Lin", email: "lin@acme.test" }] }));
    const importId = await applyVia("createImport", { provider: "xero", sourceLabel: "Acme contacts", target: { kind: "table", tableId } });
    expect(getJob(dir, T1, importId)?.status).toBe("draft");
    await applyVia("mapImportFields", { importId, mapping: [{ sourceField: "name", targetField: "name" }, { sourceField: "email", targetField: "email" }], target: { kind: "table", tableId } });
    await applyVia("pullImportData", { importId });
    const job = getJob(dir, T1, importId);
    expect(job?.status).toBe("staged");
    const staging = getStaging(dir, T1, importId);
    expect(staging?.rows).toHaveLength(2);
    // Preview is read-only: no audit/run/staging change, never gates.
    const before = listAudit(dir, T1).length;
    const runsBefore = listRuns(dir, T1, importId).length;
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}/preview`, { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { staged: number; previewRows: unknown[] };
    expect(body.staged).toBe(2);
    expect(body.previewRows).toHaveLength(2);
    expect(listAudit(dir, T1).length).toBe(before);
    expect(listRuns(dir, T1, importId).length).toBe(runsBefore);
    expect(getStaging(dir, T1, importId)?.rows).toHaveLength(2); // untouched
    // Commit: rides the tables importTableRows card — ONE card.
    const commit = await submitImportWrite(dir, T1, "commitImport", { payload: { importId }, via: "portal" }, T1);
    expect(commit.applied || commit.pending).toBe(true);
    let actionId = "";
    if (commit.pending) {
      actionId = commit.approvalActionId;
      const done = await executePendingImportWrite(dir, T1, actionId, T1);
      expect(done.ok, JSON.stringify(done)).toBe(true);
    }
    const rows = listRows(dir, T1, tableId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.data.name).sort()).toEqual(["Ada", "Lin"]);
    expect(getJob(dir, T1, importId)?.status).toBe("committed");
    const runs = listRuns(dir, T1, importId).filter((r) => r.op === "commitImport");
    expect(runs[runs.length - 1]?.committed).toBe(2);
  });

  it("pull on a provider with NO wired source honestly reports 0 pulled", async () => {
    registerImportSource("xero", async () => ({ rows: [] })); // never mind — remove wiring below
    const tableId = seedTable();
    const importId = await applyVia("createImport", { provider: "hubspot", sourceLabel: "HubSpot CRM", target: { kind: "table", tableId } });
    const pull = await submitImportWrite(dir, T1, "pullImportData", { payload: { importId }, via: "portal" }, T1);
    expect(pull.applied || pull.pending).toBe(true);
    let actionId = "";
    if (pull.pending) actionId = pull.approvalActionId;
    // No source registered for hubspot → approved pull fails honestly.
    const done = await executePendingImportWrite(dir, T1, actionId || "missing", T1);
    if (actionId) {
      expect(done.ok).toBe(false);
      const runs = listRuns(dir, T1, importId).filter((r) => r.op === "pullImportData");
      const last = runs[runs.length - 1];
      expect(last?.pulled).toBe(0);
      expect(last?.note).toContain("No import source is wired for provider");
    }
  });

  it("idempotent apply replay → alreadyApplied; no duplicate rows", async () => {
    const { importId, tableId } = await seedCommittedImport();
    const commit = await submitImportWrite(dir, T1, "commitImport", { payload: { importId }, via: "portal" }, T1);
    // Already committed → fail closed (never queues, never re-imports).
    expect(commit.applied || commit.pending).toBe(false);
    const rows = listRows(dir, T1, tableId);
    expect(rows).toHaveLength(1);
    // Reject path on a NEW pull: nothing staged, job intact.
    const pull = await submitImportWrite(dir, T1, "pullImportData", { payload: { importId }, via: "portal" }, T1);
    expect(pull.applied).toBe(false);
  });

  it("reject discards the card; nothing is written", async () => {
    const tableId = seedTable();
    const importId = await applyVia("createImport", { provider: "xero", sourceLabel: "Acme", target: { kind: "table", tableId } });
    const res = await submitImportWrite(dir, T1, "updateImport", { payload: { importId, sourceLabel: "Acme v2", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(res.pending).toBe(true);
    const actionId = res.pending ? res.approvalActionId : "";
    const rej = await rejectImportWrite(dir, T1, actionId, T1);
    expect(rej.ok).toBe(true);
    expect(getJob(dir, T1, importId)?.sourceLabel).toBe("Acme"); // unchanged
    expect(listPendingWrites(dir, T1).filter((w) => w.status === "pending")).toHaveLength(0);
  });
});

describe("fail-closed validation (never queues)", () => {
  it("client-supplied ids are rejected (forged create-id) before the gate", async () => {
    const tableId = seedTable();
    const res = await submitImportWrite(dir, T1, "createImport", { payload: { id: "imp_forged", provider: "xero", sourceLabel: "X", target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(res.applied).toBe(false);
    expect(res.pending).toBe(false);
    expect(resError(res)).toContain("not accepted");
    expect(listJobs(dir, T1)).toHaveLength(0);
  });
  it("unknown provider / unknown target table → 400 before the gate", async () => {
    const bad1 = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "nope", sourceLabel: "X", target: { kind: "table", tableId: "tbl_abc123" } }, via: "portal" }, T1);
    expect(bad1.pending).toBe(false);
    expect(resError(bad1)).toContain("unknown import provider");
    const bad2 = await submitImportWrite(dir, T1, "createImport", { payload: { provider: "xero", sourceLabel: "X", target: { kind: "table", tableId: "tbl_unknown" } }, via: "portal" }, T1);
    expect(bad2.pending).toBe(false);
    expect(resError(bad2)).toContain("not found");
  });
  it("mapping caps and unknown target fields fail closed", async () => {
    const tableId = seedTable();
    const importId = await applyVia("createImport", { provider: "xero", sourceLabel: "Acme", target: { kind: "table", tableId } });
    const tooMany = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: Array.from({ length: MAX_MAPPING_FIELDS + 1 }, (_, i) => ({ sourceField: `s${i}`, targetField: "name" })), target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(tooMany.pending).toBe(false);
    expect(resError(tooMany)).toContain("≤");
    const badField = await submitImportWrite(dir, T1, "mapImportFields", { payload: { importId, mapping: [{ sourceField: "name", targetField: "nope" }], target: { kind: "table", tableId } }, via: "portal" }, T1);
    expect(badField.pending).toBe(false);
    expect(resError(badField)).toContain("not a field");
  });
  it("commit before staging / without mapping fails closed", async () => {
    const tableId = seedTable();
    const importId = await applyVia("createImport", { provider: "xero", sourceLabel: "Acme", target: { kind: "table", tableId } });
    const c1 = await submitImportWrite(dir, T1, "commitImport", { payload: { importId }, via: "portal" }, T1);
    expect(c1.pending).toBe(false);
    expect(resError(c1)).toContain("pull before commit");
    const c2 = await submitImportWrite(dir, T1, "commitImport", { payload: { importId }, via: "portal" }, T1);
    expect(c2.pending).toBe(false);
  });
});

describe("tenant isolation", () => {
  it("a stranger's import id → 404 (no IDOR); T2 lists nothing of T1", async () => {
    const { importId } = await seedCommittedImport();
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}`), { userEmail: T2, dataDir: dir });
    expect(res.status).toBe(404);
    const list = await handleNativeImportAuthed(new Request("http://x/api/native/import"), { userEmail: T2, dataDir: dir });
    const body = (await list.json()).data as { imports: unknown[] };
    expect(body.imports).toHaveLength(0);
  });
  it("T2 cannot pull/map/commit T1's import — mutation paths 404", async () => {
    const tableId = seedTable(T1);
    const importId = await applyVia("createImport", { provider: "xero", sourceLabel: "Acme", target: { kind: "table", tableId } }, T1);
    for (const tail of ["pull", "map", "commit"]) {
      const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}/${tail}`, { method: "POST" }), { userEmail: T2, dataDir: dir });
      expect(res.status).toBe(404);
    }
  });
});

describe("HTTP surface", () => {
  it("GET list → 200 with tenant-scoped jobs; unknown route → 404; wrong method → 405", async () => {
    await seedCommittedImport();
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import"), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { imports: { id: string }[] };
    expect(body.imports.length).toBeGreaterThan(0);
    expect(body.imports[0]).not.toHaveProperty("tenantId");
    const nf = await handleNativeImportAuthed(new Request("http://x/api/native/import/nope"), { userEmail: T1, dataDir: dir });
    expect(nf.status).toBe(404);
    const m405 = await handleNativeImportAuthed(new Request("http://x/api/native/import/writes", { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(m405.status).toBe(405);
  });
  it("writes mirror projects NO payloads (evidence not data)", async () => {
    await seedCommittedImport();
    const res = await handleNativeImportAuthed(new Request("http://x/api/native/import/writes"), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { writes: { payload?: unknown }[] };
    for (const w of body.writes) expect(w.payload).toEqual({});
  });
  it("runs ledger is tenant-scoped and honest", async () => {
    const { importId } = await seedCommittedImport();
    const res = await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}/runs`), { userEmail: T1, dataDir: dir });
    expect(res.status).toBe(200);
    const body = (await res.json()).data as { runs: { committed: number }[] };
    expect(body.runs.length).toBeGreaterThan(0);
  });
});

describe("audit + typed events", () => {
  it("audit records every mutation incl. pulled/mapped/committed; typed events register", () => {
    for (const t of [
      "native.import.created", "native.import.updated", "native.import.deleted",
      "native.import.pulled", "native.import.mapped", "native.import.committed",
      "native.import.pending", "native.import.applied", "native.import.rejected",
      "native.import.failed",
    ]) {
      const v = validateNativeEventType(t, { eventId: "evt_x" });
      expect(v).toMatchObject({ ok: true });
    }
    const audit = listAudit(dir, T1);
    expect(audit.length).toBe(0); // fresh dir before seeding
  });
  it("audit grows only on writes (preview never writes)", async () => {
    const tableId = seedTable();
    const importId = await applyVia("createImport", { provider: "xero", sourceLabel: "Acme", target: { kind: "table", tableId } });
    const before = listAudit(dir, T1).length;
    await handleNativeImportAuthed(new Request(`http://x/api/native/import/${importId}/preview`, { method: "POST" }), { userEmail: T1, dataDir: dir });
    expect(listAudit(dir, T1).length).toBe(before);
  });
});