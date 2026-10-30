/**
 * native/fileimport/gate.ts — the write path for the universal file import.
 *
 * WHERE THE LINE IS DRAWN (and why):
 *   - `createFileImport`, `uploadFileImport`, `mapFileImportFields` mutate ONLY
 *     the tenant's own draft job record. They touch no capability store, hold no
 *     customer data in any capability, and are fully reversible (the job can be
 *     deleted). They are applied immediately and recorded in the append-only
 *     native.fileimport.* audit.
 *   - `commitFileImport` is the ONE action that writes into a real store
 *     (native/tables rows, native/knowledgebase articles). It rides the
 *     Approval Queue verb-first, exactly like every other native write, and is
 *     executed only by this slice's apply path (or by an explicit autonomy
 *     allow-list entry — the gate decides, never this module).
 *
 * TWO PROPERTIES THAT MUST HOLD, ALWAYS:
 *   1. A failed row does not partially write. Every row is mapped, coerced and
 *      validated against the real target schema BEFORE the first write; if ANY
 *      row is invalid the commit is REFUSED (400 + the full per-row list) and
 *      zero rows are written. There is no "write the good ones" path.
 *   2. An import can only ADD. De-dupe policy is SKIP: a record already present
 *      in the target (or earlier in the same file) is skipped and counted.
 *      Nothing is ever updated, overwritten or deleted — so re-running the same
 *      file writes nothing the second time.
 */
import { approvalGate, markApproved, markRejected, type ApprovalGateOutcome } from "../../lib/approval-queue";
import { recordAutonomyOutcome } from "../../lib/autonomy";
import { checkImportAllowed } from "../../lib/entitlement-store";
import { getTable, generateTableEntityId, insertRow, listRows } from "../tables/store";
import { generateKnowledgeBaseEntityId, listArticles, saveArticle } from "../knowledgebase/store";
import { getJob, getPendingWriteByAction, listJobs, listPendingWrites, saveJob, savePendingWrite, markPendingWrite, saveRows, getRows, appendAudit } from "./store";
import { deriveColumns, kbTitleKey, normalizeFormat, parseFileContent, stableKey, validateFileImportRows, validateMapping } from "./parse";
import {
  MAX_FILE_IMPORT_JOBS,
  MAX_FILE_IMPORT_NAME,
  MAX_FILE_IMPORT_PENDING,
  NATIVE_FILE_IMPORT_PROVIDER,
  NATIVE_FILE_IMPORT_WORKFLOW_ID,
  type FileImportJob,
  type FileImportMapping,
  type FileImportOp,
  type FileImportTarget,
  type PendingFileImportWrite,
} from "./types";
import { generateFileImportEntityId } from "./store";

export const FILE_IMPORT_ACTION: Record<FileImportOp, string> = {
  createFileImport: "createFileImport",
  uploadFileImport: "uploadFileImport",
  mapFileImportFields: "mapFileImportFields",
  commitFileImport: "commitFileImport",
};

export type FileImportWriteResult =
  | { applied: true; pending: false; op: FileImportOp; id?: string; autonomy?: boolean; result?: Record<string, unknown> }
  | { applied: false; pending: true; op: FileImportOp; approvalActionId: string; fiwId: string }
  | { applied: false; pending: false; op: FileImportOp; error: string };

// ── Target resolution (fail-closed: in-tenant target only) ─────────────────
function resolveTarget(dataDir: string, tenantId: string, raw: unknown): FileImportTarget {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("target is required");
  const t = raw as { kind?: unknown; tableId?: unknown };
  if (t.kind === "kb-article") return { kind: "kb-article" };
  if (t.kind !== "table") throw new Error('target.kind must be "table" or "kb-article"');
  const tableId = typeof t.tableId === "string" ? t.tableId.trim() : "";
  if (!/^tbl_[A-Za-z0-9]+$/.test(tableId)) throw new Error("target.tableId must be a server-assigned table id");
  // In-tenant only: a stranger's table id is not in this tenant's store → 400.
  if (!getTable(dataDir, tenantId, tableId)) throw new Error("target table not found in this workspace");
  return { kind: "table", tableId };
}

function jobName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) throw new Error("name is required");
  if (name.length > MAX_FILE_IMPORT_NAME) throw new Error(`name must be ${MAX_FILE_IMPORT_NAME} characters or fewer`);
  return name;
}

function jobId(payload: Record<string, unknown>): string {
  const id = typeof payload.jobId === "string" ? payload.jobId : "";
  if (!/^fimp_[A-Za-z0-9]+$/.test(id)) throw new Error("jobId must be a server-assigned file-import id");
  return id;
}

// ── Existing de-dupe keys for a target store (SKIP policy) ────────────────
export function existingTargetKeys(dataDir: string, tenantId: string, target: FileImportTarget): Set<string> {
  if (target.kind === "table") {
    if (!target.tableId) return new Set();
    return new Set(listRows(dataDir, tenantId, target.tableId).map((r) => stableKey(r.data)));
  }
  return new Set(listArticles(dataDir, tenantId).map((a) => kbTitleKey(a.title)));
}

/** Recompute the full validation for a job against the CURRENT target state. */
export function validateJob(dataDir: string, tenantId: string, job: FileImportJob) {
  const rows = getRows(dataDir, tenantId, job.id);
  const table = job.target.kind === "table" && job.target.tableId ? getTable(dataDir, tenantId, job.target.tableId) : null;
  return {
    rows,
    table,
    validation: validateFileImportRows({
      targetKind: job.target.kind,
      table,
      mapping: job.mapping,
      rows,
      existingKeys: existingTargetKeys(dataDir, tenantId, job.target),
    }),
  };
}

// ── Apply paths for the un-gated draft-scaffolding ops ────────────────────
function applyCreate(dataDir: string, tenantId: string, payload: Record<string, unknown>, actor: string): { id: string } {
  if (listJobs(dataDir, tenantId).length >= MAX_FILE_IMPORT_JOBS) {
    throw new Error(`Import job limit reached (${MAX_FILE_IMPORT_JOBS} per workspace). Delete an old import first.`);
  }
  if (payload.id !== undefined) throw new Error("client-supplied ids are not accepted");
  const now = new Date().toISOString();
  const job: FileImportJob = {
    id: generateFileImportEntityId("fimp"),
    tenantId,
    name: jobName(payload.name),
    target: resolveTarget(dataDir, tenantId, payload.target),
    format: null,
    status: "draft",
    columns: [],
    mapping: [],
    rowCount: 0,
    byteLength: 0,
    createdAt: now,
    createdBy: actor,
    updatedAt: now,
    updatedBy: actor,
  };
  saveJob(dataDir, job);
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.fileimport.created",
    entityId: job.id,
    detail: `Created file import "${job.name}" → ${job.target.kind}${job.target.tableId ? ` ${job.target.tableId}` : ""}`,
  });
  return { id: job.id };
}

function applyUpload(dataDir: string, tenantId: string, payload: Record<string, unknown>, actor: string): { id: string; rowCount: number; columns: number } {
  const job = getJob(dataDir, tenantId, jobId(payload));
  if (!job) throw new Error("Import not found");
  if (job.status === "committed") throw new Error("this import has already been committed — create a new import to add more rows");
  const parsed = parseFileContent(payload.format, payload.content);
  if (!parsed.ok) throw new Error(parsed.error);
  const normalized = normalizeFormat(payload.format);
  if (!normalized.ok) throw new Error(normalized.error);
  const rows = parsed.rows.map((values, i) => ({ rowNumber: i + 1, values }));
  const columns = deriveColumns(parsed.rows);
  if (columns.length === 0) throw new Error("the file has no columns to map");
  saveRows(dataDir, tenantId, job.id, rows);
  const byteLength = Buffer.byteLength(String(payload.content), "utf-8");
  const next: FileImportJob = {
    ...job,
    format: normalized.format,
    status: "uploaded",
    columns,
    // A new file invalidates an old mapping only when the columns changed.
    mapping: job.mapping.filter((m) => columns.includes(m.sourceField)),
    rowCount: rows.length,
    byteLength,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
    error: undefined,
  };
  saveJob(dataDir, next);
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.fileimport.uploaded",
    entityId: job.id,
    detail: `Uploaded ${rows.length} row(s), ${columns.length} column(s) (${next.format}, ${byteLength} bytes)`,
  });
  return { id: job.id, rowCount: rows.length, columns: columns.length };
}

function applyMap(dataDir: string, tenantId: string, payload: Record<string, unknown>, actor: string): { id: string; mapped: number } {
  const job = getJob(dataDir, tenantId, jobId(payload));
  if (!job) throw new Error("Import not found");
  if (job.status === "committed") throw new Error("this import has already been committed — its mapping is locked");
  if (job.rowCount === 0) throw new Error("upload a file before mapping columns");
  const table = job.target.kind === "table" && job.target.tableId ? getTable(dataDir, tenantId, job.target.tableId) : null;
  if (job.target.kind === "table" && !table) throw new Error("the target table no longer exists");
  const checked = validateMapping(payload.mapping, job.columns, job.target.kind, table);
  if (!checked.ok) throw new Error(checked.error);
  const mapping: FileImportMapping[] = checked.mapping;
  const next: FileImportJob = {
    ...job,
    mapping,
    status: "mapped",
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  saveJob(dataDir, next);
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.fileimport.mapped",
    entityId: job.id,
    detail: `Saved ${mapping.length} column mapping(s): ${mapping.map((m) => `${m.sourceField}→${m.targetField}`).join(", ")}`,
  });
  return { id: job.id, mapped: mapping.length };
}

// ── The gated write: commit rows into the real store ──────────────────────
/** Write validated records through the target store's OWN writer. */
function writeRecords(
  dataDir: string,
  tenantId: string,
  job: FileImportJob,
  records: Record<string, unknown>[],
  actor: string,
): { committed: number; ids: string[] } {
  const now = new Date().toISOString();
  const ids: string[] = [];
  if (job.target.kind === "table") {
    const tableId = job.target.tableId as string;
    for (const data of records) {
      const row = insertRow(dataDir, {
        id: generateTableEntityId("row"),
        tenantId,
        tableId,
        data,
        createdAt: now,
        createdBy: actor,
        updatedAt: now,
        updatedBy: actor,
      });
      ids.push(row.id);
    }
    return { committed: ids.length, ids };
  }
  for (const record of records) {
    const article = {
      id: generateKnowledgeBaseEntityId("kba"),
      tenantId,
      title: String(record.title ?? ""),
      body: String(record.body ?? ""),
      tags: Array.isArray(record.tags) ? (record.tags as string[]) : [],
      // Imported articles land as DRAFTS — publishing stays an explicit,
      // separate, approval-gated action in the knowledge-base slice.
      status: "draft" as const,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    saveArticle(dataDir, article);
    ids.push(article.id);
  }
  return { committed: ids.length, ids };
}

/**
 * Execute a commit for a job. Called ONLY after the Approval Queue allowed it
 * (or from the apply path, which marks the card approved first). Re-validates
 * against the CURRENT target state, so a stale approval can never write rows
 * that are invalid or duplicated now.
 */
export function executeCommit(
  dataDir: string,
  tenantId: string,
  jobIdValue: string,
  actor: string,
): { ok: true; committed: number; skipped: number; ids: string[] } | { ok: false; error: string; rowErrors?: unknown } {
  const job = getJob(dataDir, tenantId, jobIdValue);
  if (!job) return { ok: false, error: "Import not found" };
  if (job.status === "committed") return { ok: false, error: "this import has already been committed" };
  if (job.rowCount === 0) return { ok: false, error: "upload a file before committing" };
  if (job.mapping.length === 0) return { ok: false, error: "save a column mapping before committing" };
  const { validation } = validateJob(dataDir, tenantId, job);
  if (validation.invalid > 0) {
    return {
      ok: false,
      error: `Commit refused: ${validation.invalid} row(s) failed validation and NOTHING was written. Fix the rows listed and re-upload.`,
      rowErrors: validation.errors,
    };
  }
  if (validation.records.length === 0) {
    return {
      ok: false,
      error: `Nothing to write: all ${validation.skipped} row(s) are already in the target (duplicates are skipped, never updated).`,
    };
  }
  // SLICE 142 — the tier's monthly import volume, enforced at the ONE funnel
  // that writes rows (so a queued approval can never bypass it). Refused
  // BEFORE the first write: nothing is stored, the job stays uncommitted and
  // the message names the tier and the limit.
  const quota = checkImportAllowed(tenantId, validation.records.length, dataDir).quota;
  if (!quota.allowed) {
    appendAudit(dataDir, {
      tenantId,
      actor,
      action: "native.fileimport.quota-refused",
      entityId: job.id,
      detail: `Refused by the ${quota.limit} rows/month plan limit (${quota.used} used, ${quota.requested} requested) — nothing written`,
    });
    return { ok: false, error: quota.message };
  }
  let written: { committed: number; ids: string[] };
  try {
    written = writeRecords(dataDir, tenantId, job, validation.records, actor);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendAudit(dataDir, { tenantId, actor, action: "native.fileimport.failed", entityId: job.id, detail: `Commit failed while writing: ${msg}` });
    return { ok: false, error: msg };
  }
  const now = new Date().toISOString();
  saveJob(dataDir, {
    ...job,
    status: "committed",
    committedAt: now,
    committedBy: actor,
    committedCount: written.committed,
    skippedCount: validation.skipped,
    updatedAt: now,
    updatedBy: actor,
  });
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.fileimport.committed",
    entityId: job.id,
    detail: `Wrote ${written.committed} record(s) into ${job.target.kind === "table" ? `table ${job.target.tableId}` : "the knowledge base"}; skipped ${validation.skipped} duplicate(s)`,
  });
  return { ok: true, committed: written.committed, skipped: validation.skipped, ids: written.ids };
}

/**
 * Submit one file-import action. Draft-scaffolding ops apply immediately (and
 * are audited); `commitFileImport` goes through the Approval Queue.
 */
export async function submitFileImportWrite(
  dataDir: string,
  tenantId: string,
  op: FileImportOp,
  payload: Record<string, unknown>,
  actor: string,
): Promise<FileImportWriteResult> {
  if (!tenantId?.trim() || !actor?.trim()) return { applied: false, pending: false, op, error: "tenantId and actor are required" };
  const body = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};

  // ── commit: the ONE gated write ──────────────────────────────────────────
  if (op === "commitFileImport") {
    let job!: FileImportJob;
    let preview!: ReturnType<typeof validateJob>["validation"];
    try {
      const found = getJob(dataDir, tenantId, jobId(body));
      if (!found) return { applied: false, pending: false, op, error: "Import not found" };
      job = found;
      if (job.status === "committed") return { applied: false, pending: false, op, error: "this import has already been committed" };
      if (job.rowCount === 0) return { applied: false, pending: false, op, error: "upload a file before committing" };
      if (job.mapping.length === 0) return { applied: false, pending: false, op, error: "save a column mapping before committing" };
      // Validate BEFORE the gate: an invalid file never even queues.
      preview = validateJob(dataDir, tenantId, job).validation;
      if (preview.invalid > 0) {
        return {
          applied: false,
          pending: false,
          op,
          error: `Commit refused: ${preview.invalid} row(s) failed validation and NOTHING was written. Fix the rows listed and re-upload.`,
        };
      }
      if (preview.records.length === 0) {
        return { applied: false, pending: false, op, error: `Nothing to write: all ${preview.skipped} row(s) are already in the target (duplicates are skipped, never updated).` };
      }
      // SLICE 142 — refuse over-quota imports HERE too, so an honest message
      // reaches the tenant immediately instead of an approval card that would
      // fail at apply time. The apply path re-checks (executeCommit).
      const quota = checkImportAllowed(tenantId, preview.records.length, dataDir).quota;
      if (!quota.allowed) {
        appendAudit(dataDir, {
          tenantId,
          actor,
          action: "native.fileimport.quota-refused",
          entityId: job.id,
          detail: `Refused by the ${quota.limit} rows/month plan limit (${quota.used} used, ${quota.requested} requested) — nothing queued, nothing written`,
        });
        return { applied: false, pending: false, op, error: quota.message };
      }
    } catch (e) {
      return { applied: false, pending: false, op, error: e instanceof Error ? e.message : String(e) };
    }

    const gate: ApprovalGateOutcome = approvalGate(
      tenantId,
      FILE_IMPORT_ACTION.commitFileImport,
      NATIVE_FILE_IMPORT_PROVIDER,
      { jobId: job.id, rows: preview.records.length, target: job.target },
      { dataDir, workflowId: NATIVE_FILE_IMPORT_WORKFLOW_ID },
    );
    if (gate.error) return { applied: false, pending: false, op, error: gate.error };
    if (gate.allowed) {
      const out = executeCommit(dataDir, tenantId, job.id, actor);
      if (!out.ok) return { applied: false, pending: false, op, error: out.error };
      if (gate.autonomy) {
        try {
          recordAutonomyOutcome(tenantId, NATIVE_FILE_IMPORT_WORKFLOW_ID, FILE_IMPORT_ACTION.commitFileImport, NATIVE_FILE_IMPORT_PROVIDER, true, {
            dataDir,
            allowListId: gate.allowListId,
            target: job.id,
          });
        } catch {
          /* outcome recording must never block an authorized write */
        }
      }
      return { applied: true, pending: false, op, id: job.id, autonomy: !!gate.autonomy, result: { committed: out.committed, skipped: out.skipped } };
    }

    // Approval ON → durable pending mirror linked to the Queue card.
    const pending = listPendingWrites(dataDir, tenantId).filter((w) => w.status === "pending");
    if (pending.length >= MAX_FILE_IMPORT_PENDING) {
      return { applied: false, pending: false, op, error: `Pending approval limit reached (${MAX_FILE_IMPORT_PENDING}) — approve or reject the queued commits first` };
    }
    const fiw: PendingFileImportWrite = {
      id: generateFileImportEntityId("fiw"),
      tenantId,
      jobId: job.id,
      action: FILE_IMPORT_ACTION.commitFileImport,
      status: "pending",
      approvalActionId: gate.actionId || "",
      rowCount: preview.records.length,
      requestedBy: actor,
      requestedAt: new Date().toISOString(),
    };
    savePendingWrite(dataDir, fiw);
    appendAudit(dataDir, {
      tenantId,
      actor,
      action: "native.fileimport.pending",
      entityId: job.id,
      detail: `Commit queued for approval — ${preview.records.length} record(s) into ${job.target.kind === "table" ? `table ${job.target.tableId}` : "the knowledge base"} (nothing written yet)`,
    });
    return { applied: false, pending: true, op, approvalActionId: fiw.approvalActionId, fiwId: fiw.id };
  }

  // ── draft scaffolding: applied immediately, audited ──────────────────────
  try {
    if (op === "createFileImport") {
      const out = applyCreate(dataDir, tenantId, body, actor);
      return { applied: true, pending: false, op, id: out.id };
    }
    if (op === "uploadFileImport") {
      const out = applyUpload(dataDir, tenantId, body, actor);
      return { applied: true, pending: false, op, id: out.id, result: { rowCount: out.rowCount, columns: out.columns } };
    }
    if (op === "mapFileImportFields") {
      const out = applyMap(dataDir, tenantId, body, actor);
      return { applied: true, pending: false, op, id: out.id, result: { mapped: out.mapped } };
    }
    return { applied: false, pending: false, op, error: "unsupported file-import action" };
  } catch (e) {
    return { applied: false, pending: false, op, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * APPROVE path — execute the queued commit. Idempotent: replaying an applied
 * card reports `alreadyApplied` and writes nothing (the job is already
 * committed, and duplicates are skipped anyway).
 */
export function applyPendingFileImport(
  dataDir: string,
  tenantId: string,
  approvalActionId: string,
  actor: string,
): { ok: true; committed: number; skipped: number; alreadyApplied?: boolean } | { ok: false; error: string } {
  const write = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!write) return { ok: false, error: "no pending file-import commit for this approval" };
  if (write.status === "applied") return { ok: true, committed: write.appliedResult?.committed ?? 0, skipped: write.appliedResult?.skipped ?? 0, alreadyApplied: true };
  if (write.status === "rejected") return { ok: false, error: "this commit was already rejected" };
  const out = executeCommit(dataDir, tenantId, write.jobId, actor);
  if (!out.ok) {
    markPendingWrite(dataDir, tenantId, write.id, "applied", { error: out.error, appliedResult: { committed: 0, skipped: 0 } });
    markApproved(tenantId, approvalActionId, actor, { error: out.error }, dataDir);
    appendAudit(dataDir, { tenantId, actor, action: "native.fileimport.failed", entityId: write.jobId, detail: `Approved commit failed: ${out.error}` });
    return { ok: false, error: out.error };
  }
  markPendingWrite(dataDir, tenantId, write.id, "applied", { appliedResult: { committed: out.committed, skipped: out.skipped } });
  markApproved(tenantId, approvalActionId, actor, { result: { committed: out.committed, skipped: out.skipped } }, dataDir);
  return { ok: true, committed: out.committed, skipped: out.skipped };
}

/** REJECT path — discard the queued commit. Nothing is written, ever. */
export function rejectFileImportWrite(dataDir: string, tenantId: string, approvalActionId: string, actor: string): { ok: boolean; error?: string } {
  const write = getPendingWriteByAction(dataDir, tenantId, approvalActionId);
  if (!write) return { ok: false, error: "no pending file-import commit for this approval" };
  if (write.status !== "pending") return { ok: false, error: "this commit was already decided" };
  markPendingWrite(dataDir, tenantId, write.id, "rejected");
  markRejected(tenantId, approvalActionId, actor, dataDir);
  appendAudit(dataDir, { tenantId, actor, action: "native.fileimport.rejected", entityId: write.jobId, detail: "Commit rejected — nothing was written" });
  return { ok: true };
}

export { getPendingWriteById, getPendingWriteForJob } from "./store";
