/**
 * native-file-import.test.ts — slice 137: the UNIVERSAL FILE IMPORT lane.
 *
 * What this file pins (the guardrails that make the lane safe to sell):
 *   1. tenant isolation — structural `{ [tenantId]: ... }` stores; a stranger's
 *      job id resolves to null and the HTTP surface answers 404 (no IDOR),
 *   2. per-row error list — a file with several bad rows reports EVERY bad row
 *      with its reasons; it never throws on the first one,
 *   3. caps — row cap and byte cap refuse the upload with a clear message and
 *      store nothing,
 *   4. a failed row does not partially write — when any row is invalid the
 *      commit is refused and ZERO records land in the target store,
 *   5. de-dupe = SKIP — a second run of the same file writes nothing and never
 *      updates or deletes a record it did not create,
 *   6. append-only audit on every mutation,
 *   7. the ONE gated action (commitFileImport) rides the Approval Queue; draft
 *      scaffolding is applied immediately and audited,
 *   8. both real targets write through their OWN store writers (tables rows,
 *      knowledge-base articles),
 *   9. XLSX is refused with the reason and the fix.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isWriteAction } from "../lib/approval-queue";
import { handleNativeFileImportAuthed } from "../native/fileimport/router";
import {
  applyPendingFileImport,
  existingTargetKeys,
  rejectFileImportWrite,
  submitFileImportWrite,
  validateJob,
} from "../native/fileimport/gate";
import { getJob, listAudit, listJobs, listPendingWrites } from "../native/fileimport/store";
import { parseFileContent, validateFileImportRows } from "../native/fileimport/parse";
import {
  DEDUPE_POLICY,
  GATED_FILE_IMPORT_OPS,
  MAX_FILE_IMPORT_BYTES,
  MAX_FILE_IMPORT_ROWS,
} from "../native/fileimport/types";
import { createTable, listRows } from "../native/tables/store";
import { listArticles } from "../native/knowledgebase/store";
import type { TableDef } from "../native/tables/types";

const T1 = "tenant-one@example.test";
const T2 = "tenant-two@example.test";
const TABLE_ID = "tbl_fileimport01";

let dataDir = "";

function seedTable(tenantId: string = T1): TableDef {
  const now = new Date().toISOString();
  const table: TableDef = {
    id: TABLE_ID,
    tenantId,
    name: "Clients",
    description: "",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "seats", label: "Seats", type: "number" },
    ],
    version: 1,
    createdAt: now,
    createdBy: tenantId,
    updatedAt: now,
    updatedBy: tenantId,
  };
  createTable(dataDir, table);
  return table;
}

const GOOD_CSV = ["Name,Email,Seats", "Acme Ltd,ops@acme.test,12", "Beta Co,hi@beta.test,4", "Gamma Inc,ceo@gamma.test,7"].join("\n");
const MIXED_CSV = ["Name,Email,Seats", "Acme Ltd,ops@acme.test,12", "Bad Email,not-an-email,3", "No Seats,,abc"].join("\n");

async function json(res: Response): Promise<any> {
  return res.json();
}

function req(path: string, method = "GET", body?: unknown): Request {
  return new Request(`http://local.test${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** create → upload → map, all applied immediately (draft scaffolding). */
async function stageJob(opts: {
  tenantId?: string;
  csv?: string;
  name?: string;
  target?: { kind: "table"; tableId: string } | { kind: "kb-article" };
  mapping?: Array<{ sourceField: string; targetField: string }>;
} = {}) {
  const tenantId = opts.tenantId ?? T1;
  const created = await submitFileImportWrite(
    dataDir,
    tenantId,
    "createFileImport",
    { name: opts.name ?? "Clients 2026", target: opts.target ?? { kind: "table", tableId: TABLE_ID } },
    tenantId,
  );
  expect(created.applied).toBe(true);
  const jobId = created.applied ? (created.id as string) : "";
  const uploaded = await submitFileImportWrite(dataDir, tenantId, "uploadFileImport", { jobId, format: "csv", content: opts.csv ?? GOOD_CSV }, tenantId);
  expect(uploaded.applied).toBe(true);
  const mapping =
    opts.mapping ??
    (opts.target?.kind === "kb-article"
      ? [{ sourceField: "Title", targetField: "title" }, { sourceField: "Body", targetField: "body" }]
      : [
          { sourceField: "Name", targetField: "name" },
          { sourceField: "Email", targetField: "email" },
          { sourceField: "Seats", targetField: "seats" },
        ]);
  const mapped = await submitFileImportWrite(dataDir, tenantId, "mapFileImportFields", { jobId, mapping }, tenantId);
  expect(mapped.applied).toBe(true);
  return jobId;
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "fileimport-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("write-verb classification (the standing fail-open guard)", () => {
  it("classifies every file-import action as a WRITE (verb-first)", () => {
    expect(isWriteAction("createFileImport")).toBe(true);
    expect(isWriteAction("uploadFileImport")).toBe(true);
    expect(isWriteAction("mapFileImportFields")).toBe(true);
    expect(isWriteAction("commitFileImport")).toBe(true);
  });

  it("gates exactly ONE action: the one that writes into a real store", () => {
    expect([...GATED_FILE_IMPORT_OPS]).toEqual(["commitFileImport"]);
    expect(DEDUPE_POLICY).toBe("skip");
  });
});

describe("parsing + caps (fail-closed before anything is stored)", () => {
  it("parses CSV with quoted fields and CRLF", () => {
    const out = parseFileContent("csv", 'Name,Note\r\n"Acme, Ltd","say ""hi"""\r\n');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.rows).toHaveLength(1);
      expect(out.rows[0]).toEqual({ Name: "Acme, Ltd", Note: 'say "hi"' });
    }
  });

  it("refuses XLSX with the reason and the fix", () => {
    const out = parseFileContent("xlsx", "PK\u0003\u0004binary");
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain("not supported");
      expect(out.error).toContain("Save the sheet as CSV");
    }
  });

  it("refuses an unknown format and empty content", () => {
    expect(parseFileContent("xml", "<a/>").ok).toBe(false);
    expect(parseFileContent("csv", "   ").ok).toBe(false);
  });

  it("enforces the row cap with a clear message", () => {
    const header = "Name,Email,Seats";
    const rows = Array.from({ length: MAX_FILE_IMPORT_ROWS + 1 }, (_, i) => `Co ${i},a${i}@x.test,${i}`);
    const out = parseFileContent("csv", [header, ...rows].join("\n"));
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toContain(String(MAX_FILE_IMPORT_ROWS));
      expect(out.error).toContain("Split the file");
    }
  });

  it("enforces the byte cap with a clear message", () => {
    const big = "x".repeat(MAX_FILE_IMPORT_BYTES + 10);
    const out = parseFileContent("csv", `Name\n${big}`);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("512 KiB");
  });

  it("a refused upload stores nothing (no job rows, no target records)", async () => {
    seedTable();
    const jobId = await stageJob({ csv: GOOD_CSV });
    const before = listRows(dataDir, T1, TABLE_ID).length;
    const tooMany = Array.from({ length: MAX_FILE_IMPORT_ROWS + 1 }, (_, i) => `Co ${i},a${i}@x.test,${i}`);
    const res = await submitFileImportWrite(
      dataDir,
      T1,
      "uploadFileImport",
      { jobId, format: "csv", content: ["Name,Email,Seats", ...tooMany].join("\n") },
      T1,
    );
    expect(res.applied).toBe(false);
    if (!res.applied) expect(res.error).toContain(String(MAX_FILE_IMPORT_ROWS));
    expect(listRows(dataDir, T1, TABLE_ID).length).toBe(before);
  });
});

describe("per-row validation (never throws on the first bad row)", () => {
  it("reports EVERY bad row with its reasons, and keeps the good ones", async () => {
    seedTable();
    const jobId = await stageJob({ csv: MIXED_CSV });
    const job = getJob(dataDir, T1, jobId);
    expect(job).not.toBeNull();
    const { validation } = validateJob(dataDir, T1, job!);
    expect(validation.total).toBe(3);
    expect(validation.invalid).toBe(2);
    expect(validation.valid).toBe(1);
    expect(validation.errors.map((e) => e.rowNumber)).toEqual([2, 3]);
    expect(validation.errors[0]?.reasons.join(" ")).toContain("email");
    expect(validation.errors[1]?.reasons.join(" ")).toContain("number");
  });

  it("reports a missing required field per row instead of throwing", () => {
    const table: TableDef = {
      id: "tbl_x",
      tenantId: T1,
      name: "T",
      description: "",
      fields: [{ key: "name", label: "Name", type: "text", required: true }],
      version: 1,
      createdAt: "",
      createdBy: T1,
      updatedAt: "",
      updatedBy: T1,
    };
    const out = validateFileImportRows({
      targetKind: "table",
      table,
      mapping: [{ sourceField: "n", targetField: "name" }],
      rows: [
        { rowNumber: 1, values: { n: "ok" } },
        { rowNumber: 2, values: { n: "" } },
      ],
    });
    expect(out.valid).toBe(1);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.rowNumber).toBe(2);
  });

  it("reports 'no mapping' once per row rather than pretending the rows are fine", () => {
    const out = validateFileImportRows({ targetKind: "kb-article", table: null, mapping: [], rows: [{ rowNumber: 1, values: { t: "a" } }] });
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0]?.reasons[0]).toContain("no column mapping");
  });
});

describe("commit is all-or-nothing (a failed row does not partially write)", () => {
  it("refuses the whole file when one row is invalid and writes ZERO records", async () => {
    seedTable();
    const jobId = await stageJob({ csv: MIXED_CSV });
    const res = await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId }, T1);
    expect(res.applied).toBe(false);
    if (!res.applied && !res.pending) expect(res.error).toContain("NOTHING was written");
    // The good row (row 1) must NOT have been written.
    expect(listRows(dataDir, T1, TABLE_ID)).toHaveLength(0);
    expect(getJob(dataDir, T1, jobId)?.status).toBe("mapped");
    // Nothing was queued for approval either.
    expect(listPendingWrites(dataDir, T1)).toHaveLength(0);
  });

  it("writes every valid row once the file is fixed", async () => {
    seedTable();
    const jobId = await stageJob({ csv: GOOD_CSV });
    const res = await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId }, T1);
    // Approval is ON by default → the commit queues; nothing is written yet.
    expect(res.applied).toBe(false);
    expect(res.pending).toBe(true);
    expect(listRows(dataDir, T1, TABLE_ID)).toHaveLength(0);
    const pending = listPendingWrites(dataDir, T1)[0];
    const applied = applyPendingFileImport(dataDir, T1, pending!.approvalActionId, T1);
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.committed).toBe(3);
    const rows = listRows(dataDir, T1, TABLE_ID);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.data.name).sort()).toEqual(["Acme Ltd", "Beta Co", "Gamma Inc"]);
    // CSV coercion: "12" became the number 12.
    expect(rows.find((r) => r.data.name === "Acme Ltd")?.data.seats).toBe(12);
    const job = getJob(dataDir, T1, jobId);
    expect(job?.status).toBe("committed");
    expect(job?.committedCount).toBe(3);
  });

  it("replaying an applied commit writes nothing new (idempotent)", async () => {
    seedTable();
    const jobId = await stageJob();
    const res = await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId }, T1);
    const pending = listPendingWrites(dataDir, T1)[0];
    applyPendingFileImport(dataDir, T1, pending!.approvalActionId, T1);
    const replay = applyPendingFileImport(dataDir, T1, pending!.approvalActionId, T1);
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.alreadyApplied).toBe(true);
    expect(listRows(dataDir, T1, TABLE_ID)).toHaveLength(3);
    expect(res.pending).toBe(true);
  });
});

describe("de-dupe policy = SKIP (never update, never delete)", () => {
  it("a second import of the same file writes nothing and leaves the first records untouched", async () => {
    seedTable();
    const first = await stageJob({ name: "First" });
    const r1 = await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId: first }, T1);
    expect(r1.pending).toBe(true);
    applyPendingFileImport(dataDir, T1, listPendingWrites(dataDir, T1)[0]!.approvalActionId, T1);
    const before = listRows(dataDir, T1, TABLE_ID);
    expect(before).toHaveLength(3);

    const second = await stageJob({ name: "Second" });
    const r2 = await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId: second }, T1);
    expect(r2.applied).toBe(false);
    if (!r2.applied && !r2.pending) expect(r2.error).toContain("already in the target");

    const after = listRows(dataDir, T1, TABLE_ID);
    expect(after).toHaveLength(3);
    // Same ids, same data — nothing was updated or replaced.
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
  });

  it("skips duplicates INSIDE one file as well", () => {
    const table: TableDef = {
      id: "tbl_y",
      tenantId: T1,
      name: "T",
      description: "",
      fields: [{ key: "name", label: "Name", type: "text" }],
      version: 1,
      createdAt: "",
      createdBy: T1,
      updatedAt: "",
      updatedBy: T1,
    };
    const out = validateFileImportRows({
      targetKind: "table",
      table,
      mapping: [{ sourceField: "n", targetField: "name" }],
      rows: [
        { rowNumber: 1, values: { n: "Acme" } },
        { rowNumber: 2, values: { n: "Acme" } },
        { rowNumber: 3, values: { n: "Beta" } },
      ],
    });
    expect(out.valid).toBe(2);
    expect(out.skipped).toBe(1);
    expect(out.skippedRowNumbers).toEqual([2]);
  });
});

describe("second real target: knowledge-base articles", () => {
  it("writes imported articles through the KB store writer as drafts", async () => {
    seedTable();
    const jobId = await stageJob({ target: { kind: "kb-article" }, csv: ["Title,Body", "How to reset,Click reset.", "Billing FAQ,We bill monthly."].join("\n") });
    const res = await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId }, T1);
    expect(res.pending).toBe(true);
    const out = applyPendingFileImport(dataDir, T1, listPendingWrites(dataDir, T1)[0]!.approvalActionId, T1);
    expect(out.ok).toBe(true);
    const articles = listArticles(dataDir, T1);
    expect(articles).toHaveLength(2);
    expect(articles[0]?.status).toBe("draft");
    expect(articles.map((a) => a.title).sort()).toEqual(["Billing FAQ", "How to reset"]);
  });

  it("uses title as the de-dupe key for articles", () => {
    const keys = new Set<string>(["how to reset"]);
    const out = validateFileImportRows({
      targetKind: "kb-article",
      table: null,
      mapping: [{ sourceField: "t", targetField: "title" }],
      rows: [{ rowNumber: 1, values: { t: "  How   to reset " } }],
      existingKeys: keys,
    });
    expect(out.skipped).toBe(1);
    expect(out.records).toHaveLength(0);
  });
});

describe("tenant isolation (no IDOR, no cross-tenant reads)", () => {
  it("a job created by tenant one is invisible to tenant two", async () => {
    seedTable();
    const jobId = await stageJob({ tenantId: T1 });
    expect(getJob(dataDir, T1, jobId)).not.toBeNull();
    expect(getJob(dataDir, T2, jobId)).toBeNull();
    expect(listJobs(dataDir, T2)).toHaveLength(0);
    // The stranger's target-key set is also empty: it can only see its own store.
    expect(existingTargetKeys(dataDir, T2, { kind: "table", tableId: TABLE_ID }).size).toBe(0);
  });

  it("answers 404 for a stranger's job id on every endpoint", async () => {
    seedTable();
    const jobId = await stageJob({ tenantId: T1 });
    for (const [path, method, body] of [
      [`/api/native/import/file/${jobId}`, "GET", undefined],
      [`/api/native/import/file/${jobId}/preview`, "POST", {}],
      [`/api/native/import/file/${jobId}/upload`, "POST", { format: "csv", content: GOOD_CSV }],
      [`/api/native/import/file/${jobId}/map`, "POST", { mapping: [{ sourceField: "Name", targetField: "name" }] }],
      [`/api/native/import/file/${jobId}/commit`, "POST", {}],
      [`/api/native/import/file/${jobId}/apply`, "POST", {}],
    ] as const) {
      const res = await handleNativeFileImportAuthed(req(path, method, body), { userEmail: T2, dataDir });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("refuses a target table that belongs to another tenant", async () => {
    seedTable(T1);
    const res = await submitFileImportWrite(dataDir, T2, "createFileImport", { name: "Steal", target: { kind: "table", tableId: TABLE_ID } }, T2);
    expect(res.applied).toBe(false);
    if (!res.applied) expect(res.error).toContain("not found in this workspace");
  });

  it("fails closed without a tenant context", async () => {
    const res = await submitFileImportWrite(dataDir, "", "createFileImport", { name: "x", target: { kind: "kb-article" } }, "");
    expect(res.applied).toBe(false);
    if (!res.applied) expect(res.error).toContain("required");
  });
});

describe("append-only audit on every mutation", () => {
  it("records created → uploaded → mapped → pending → committed", async () => {
    seedTable();
    const jobId = await stageJob();
    await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId }, T1);
    applyPendingFileImport(dataDir, T1, listPendingWrites(dataDir, T1)[0]!.approvalActionId, T1);
    const actions = listAudit(dataDir, T1).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "native.fileimport.created",
        "native.fileimport.uploaded",
        "native.fileimport.mapped",
        "native.fileimport.pending",
        "native.fileimport.committed",
      ]),
    );
  });

  it("records a rejection and writes nothing", async () => {
    seedTable();
    const jobId = await stageJob();
    await submitFileImportWrite(dataDir, T1, "commitFileImport", { jobId }, T1);
    const pending = listPendingWrites(dataDir, T1)[0]!;
    const out = rejectFileImportWrite(dataDir, T1, pending.approvalActionId, T1);
    expect(out.ok).toBe(true);
    expect(listRows(dataDir, T1, TABLE_ID)).toHaveLength(0);
    expect(listAudit(dataDir, T1).map((a) => a.action)).toContain("native.fileimport.rejected");
  });
});

describe("HTTP surface", () => {
  it("targets lists the real stores and states the de-dupe policy + caps", async () => {
    seedTable();
    const res = await handleNativeFileImportAuthed(req("/api/native/import/file/targets"), { userEmail: T1, dataDir });
    expect(res.status).toBe(200);
    const body = await json(res);
    const kinds = (body.data.targets as Array<{ kind: string }>).map((t) => t.kind);
    expect(kinds).toContain("table");
    expect(kinds).toContain("kb-article");
    expect(body.data.dedupe.policy).toBe("skip");
    expect(body.data.xlsxSupported).toBe(false);
    expect(body.data.caps.rows).toBe(MAX_FILE_IMPORT_ROWS);
  });

  it("runs the whole flow over HTTP: create 201 → upload → map → preview → commit 202 → apply", async () => {
    seedTable();
    const created = await handleNativeFileImportAuthed(
      req("/api/native/import/file", "POST", { name: "HTTP import", target: { kind: "table", tableId: TABLE_ID } }),
      { userEmail: T1, dataDir },
    );
    expect(created.status).toBe(201);
    const createdBody = await json(created);
    const jobId = createdBody.data.import.id as string;
    expect(jobId).toMatch(/^fimp_/);

    const uploaded = await handleNativeFileImportAuthed(req(`/api/native/import/file/${jobId}/upload`, "POST", { format: "csv", content: GOOD_CSV }), {
      userEmail: T1,
      dataDir,
    });
    expect(uploaded.status).toBe(200);

    const mapped = await handleNativeFileImportAuthed(
      req(`/api/native/import/file/${jobId}/map`, "POST", {
        mapping: [
          { sourceField: "Name", targetField: "name" },
          { sourceField: "Email", targetField: "email" },
          { sourceField: "Seats", targetField: "seats" },
        ],
      }),
      { userEmail: T1, dataDir },
    );
    expect(mapped.status).toBe(200);

    const previewed = await handleNativeFileImportAuthed(req(`/api/native/import/file/${jobId}/preview`, "POST", {}), { userEmail: T1, dataDir });
    expect(previewed.status).toBe(200);
    const previewBody = await json(previewed);
    expect(previewBody.data.validation.valid).toBe(3);
    expect(previewBody.data.validation.invalid).toBe(0);
    // Preview is read-only: still nothing in the store.
    expect(listRows(dataDir, T1, TABLE_ID)).toHaveLength(0);

    const committed = await handleNativeFileImportAuthed(req(`/api/native/import/file/${jobId}/commit`, "POST", {}), { userEmail: T1, dataDir });
    expect(committed.status).toBe(202);
    const commitBody = await json(committed);
    expect(commitBody.data.status).toBe("pending");
    expect(listRows(dataDir, T1, TABLE_ID)).toHaveLength(0);

    const applied = await handleNativeFileImportAuthed(req(`/api/native/import/file/${jobId}/apply`, "POST", {}), { userEmail: T1, dataDir });
    expect(applied.status).toBe(200);
    const appliedBody = await json(applied);
    expect(appliedBody.data.committed).toBe(3);
    expect(listRows(dataDir, T1, TABLE_ID)).toHaveLength(3);
  });

  it("rejects a bad mapping with 400 and a readable reason", async () => {
    seedTable();
    const jobId = await stageJob();
    const res = await handleNativeFileImportAuthed(
      req(`/api/native/import/file/${jobId}/map`, "POST", { mapping: [{ sourceField: "Nope", targetField: "name" }] }),
      { userEmail: T1, dataDir },
    );
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toContain("not a column in this file");
  });

  it("answers 404 for an unknown endpoint and 405 for a wrong method", async () => {
    seedTable();
    const unknown = await handleNativeFileImportAuthed(req("/api/native/import/file/nonsense"), { userEmail: T1, dataDir });
    expect(unknown.status).toBe(404);
    const wrongMethod = await handleNativeFileImportAuthed(req("/api/native/import/file/targets", "POST", {}), { userEmail: T1, dataDir });
    expect(wrongMethod.status).toBe(405);
  });

  it("lists the tenant's own jobs only", async () => {
    seedTable();
    await stageJob({ tenantId: T1 });
    const mine = await handleNativeFileImportAuthed(req("/api/native/import/file"), { userEmail: T1, dataDir });
    const mineBody = await json(mine);
    expect(mineBody.data.total).toBe(1);
    const theirs = await handleNativeFileImportAuthed(req("/api/native/import/file"), { userEmail: T2, dataDir });
    const theirsBody = await json(theirs);
    expect(theirsBody.data.total).toBe(0);
  });
});
