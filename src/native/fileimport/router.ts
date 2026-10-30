/**
 * native/fileimport/router.ts — HTTP surface for slice 137 (universal file
 * import). Mounted at /api/native/import/file* — BEFORE the provider-import
 * router, which owns /api/native/import* — so the two never shadow each other.
 *
 * AUTHED ONLY (401 fail-closed upstream; no public share lane):
 *
 *   GET    /api/native/import/file/targets        target datasets + fields
 *   GET    /api/native/import/file                list jobs (paginated)
 *   POST   /api/native/import/file                create a job (name + target)
 *   GET    /api/native/import/file/audit          immutable audit trail
 *   GET    /api/native/import/file/pending        queued commit(s) awaiting approval
 *   GET    /api/native/import/file/:id            job + staged rows + validation
 *   POST   /api/native/import/file/:id/upload     {format, content} → stage rows
 *   POST   /api/native/import/file/:id/map        {mapping:[{sourceField,targetField}]}
 *   POST   /api/native/import/file/:id/preview    READ-ONLY per-row validation
 *   POST   /api/native/import/file/:id/commit     GATED write into the real store
 *   POST   /api/native/import/file/:id/apply      approve the queued commit
 *   POST   /api/native/import/file/:id/reject     reject the queued commit
 *
 * Every read is tenant-scoped; a stranger's job id resolves to null → 404 (no
 * IDOR, and no "forbidden" hint that the id exists). Every mutation is audited.
 */
import { countRows, listTables } from "../tables/store";
import { listArticles } from "../knowledgebase/store";
import {
  DEDUPE_POLICY,
  DEDUPE_POLICY_TEXT,
  FILE_IMPORT_FORMATS,
  KB_ARTICLE_TARGET_FIELDS,
  MAX_FILE_IMPORT_PENDING,
  MAX_FILE_IMPORT_PREVIEW_ROWS,
  MAX_FILE_IMPORT_ROWS,
  MAX_FILE_IMPORT_BYTES,
  MAX_PAGE_SIZE,
  type FileImportJob,
} from "./types";
import {
  applyPendingFileImport,
  getPendingWriteForJob,
  rejectFileImportWrite,
  submitFileImportWrite,
  validateJob,
} from "./gate";
import { deleteJobRecord, getJob, getPendingWriteById, getRows, listAudit, listJobs, listPendingWrites } from "./store";

export interface NativeFileImportCtx {
  userEmail: string;
  dataDir: string;
}

const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });

const RE = { job: /^fimp_[A-Za-z0-9]+$/ };

/** Safe projection of a job (the tenant's own record; no hidden fields). */
export function publicJob(job: FileImportJob) {
  return {
    id: job.id,
    name: job.name,
    target: job.target,
    format: job.format,
    status: job.status,
    columns: job.columns,
    mapping: job.mapping,
    rowCount: job.rowCount,
    byteLength: job.byteLength,
    createdAt: job.createdAt,
    createdBy: job.createdBy,
    updatedAt: job.updatedAt,
    committedAt: job.committedAt ?? null,
    committedCount: job.committedCount ?? null,
    skippedCount: job.skippedCount ?? null,
    error: job.error ?? null,
  };
}

function pageParam(url: URL): { limit: number; offset: number } {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  let limit = MAX_PAGE_SIZE;
  if (rawLimit) {
    const n = Number(rawLimit);
    if (Number.isFinite(n) && n > 0) limit = Math.min(Math.trunc(n), MAX_PAGE_SIZE);
  }
  let offset = 0;
  if (rawOffset) {
    const n = Number(rawOffset);
    if (Number.isFinite(n) && n >= 0) offset = Math.trunc(n);
  }
  return { limit, offset };
}

/** Target catalog — the REAL datasets an import can write into. */
function targetsPayload(dataDir: string, tenantId: string) {
  const tables = listTables(dataDir, tenantId).map((t) => ({
    kind: "table" as const,
    tableId: t.id,
    name: t.name,
    rows: countRows(dataDir, tenantId, t.id),
    fields: t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: !!f.required })),
  }));
  const articles = listArticles(dataDir, tenantId).length;
  return {
    targets: [
      ...tables,
      {
        kind: "kb-article" as const,
        name: "Knowledge base articles",
        rows: articles,
        fields: KB_ARTICLE_TARGET_FIELDS.map((key) => ({
          key,
          label: key === "title" ? "Title" : key === "body" ? "Body" : "Tags (comma-separated)",
          type: key === "body" ? "textarea" : "text",
          required: key === "title",
        })),
      },
    ],
    formats: [...FILE_IMPORT_FORMATS],
    xlsxSupported: false,
    caps: { rows: MAX_FILE_IMPORT_ROWS, bytes: MAX_FILE_IMPORT_BYTES, mapping: 30, pendingCommits: MAX_FILE_IMPORT_PENDING },
    dedupe: { policy: DEDUPE_POLICY, text: DEDUPE_POLICY_TEXT },
  };
}

/** Job detail: the job, its staged rows (bounded), and the current validation. */
function jobDetail(dataDir: string, tenantId: string, job: FileImportJob) {
  const rows = getRows(dataDir, tenantId, job.id);
  const { validation } = validateJob(dataDir, tenantId, job);
  const pending = getPendingWriteForJob(dataDir, tenantId, job.id);
  return {
    import: publicJob(job),
    rows: rows.slice(0, MAX_FILE_IMPORT_PREVIEW_ROWS),
    rowCount: rows.length,
    validation: {
      total: validation.total,
      valid: validation.valid,
      skipped: validation.skipped,
      invalid: validation.invalid,
      errors: validation.errors.slice(0, MAX_FILE_IMPORT_PREVIEW_ROWS),
      skippedRowNumbers: validation.skippedRowNumbers.slice(0, MAX_FILE_IMPORT_PREVIEW_ROWS),
      records: validation.records.slice(0, MAX_FILE_IMPORT_PREVIEW_ROWS),
    },
    pending: pending ? { fiwId: pending.id, approvalActionId: pending.approvalActionId, rowCount: pending.rowCount, requestedAt: pending.requestedAt } : null,
  };
}

async function handleAuthed(req: Request, ctx: NativeFileImportCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/import\/file\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const method = req.method;

  // GET /api/native/import/file/targets
  if (seg.length === 1 && seg[0] === "targets") {
    if (method !== "GET") return json405();
    return Response.json({ data: targetsPayload(ctx.dataDir, tenantId) });
  }

  // GET /api/native/import/file/audit
  if (seg.length === 1 && seg[0] === "audit") {
    if (method !== "GET") return json405();
    const { limit, offset } = pageParam(url);
    const audit = listAudit(ctx.dataDir, tenantId);
    return Response.json({ data: { audit: audit.slice(offset, offset + limit), total: audit.length, limit, offset } });
  }

  // GET /api/native/import/file/pending — queued commits awaiting approval
  if (seg.length === 1 && seg[0] === "pending") {
    if (method !== "GET") return json405();
    const writes = listPendingWrites(ctx.dataDir, tenantId).filter((w) => w.status === "pending");
    return Response.json({ data: { pending: writes.map((w) => ({ fiwId: w.id, jobId: w.jobId, rowCount: w.rowCount, requestedAt: w.requestedAt, approvalActionId: w.approvalActionId })) } });
  }

  // GET /api/native/import/file — list jobs
  if (seg.length === 0) {
    if (method === "GET") {
      const { limit, offset } = pageParam(url);
      const jobs = listJobs(ctx.dataDir, tenantId);
      return Response.json({ data: { imports: jobs.slice(offset, offset + limit).map(publicJob), total: jobs.length, limit, offset } });
    }
    if (method === "POST") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("body must be a JSON object");
      const res = await submitFileImportWrite(ctx.dataDir, tenantId, "createFileImport", body as Record<string, unknown>, tenantId);
      if (!res.applied) return jsonError(res.pending ? "unexpected approval request" : res.error);
      const job = getJob(ctx.dataDir, tenantId, res.id as string);
      return Response.json({ data: { status: "applied", import: job ? publicJob(job) : null } }, { status: 201 });
    }
    return json405();
  }

  // Everything below needs a server-assigned job id (stranger → 404).
  if (!RE.job.test(seg[0] ?? "")) return json404("Unknown file-import endpoint");
  const job = getJob(ctx.dataDir, tenantId, seg[0]);
  if (!job) return json404("Import not found");

  // GET /api/native/import/file/:id
  if (seg.length === 1 && method === "GET") {
    return Response.json({ data: jobDetail(ctx.dataDir, tenantId, job) });
  }

  if (seg.length === 2 && method === "POST") {
    const verb = seg[1];
    // POST /:id/preview — READ-ONLY. Never gates, never writes, never audits.
    if (verb === "preview") {
      const detail = jobDetail(ctx.dataDir, tenantId, job);
      return Response.json({
        data: {
          ...detail,
          note: "read-only preview — nothing was written or queued",
        },
      });
    }
    if (verb === "upload" || verb === "map" || verb === "commit") {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("body must be a JSON object");
      const op = verb === "upload" ? "uploadFileImport" : verb === "map" ? "mapFileImportFields" : "commitFileImport";
      const res = await submitFileImportWrite(ctx.dataDir, tenantId, op, { ...(body as Record<string, unknown>), jobId: job.id }, tenantId);
      if (res.applied) {
        const fresh = getJob(ctx.dataDir, tenantId, job.id);
        return Response.json({ data: { status: "applied", import: fresh ? publicJob(fresh) : null, result: res.result ?? null } });
      }
      if (res.pending) {
        return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId, fiwId: res.fiwId } }, { status: 202 });
      }
      return jsonError(res.error);
    }
    if (verb === "apply" || verb === "reject") {
      const pending = getPendingWriteForJob(ctx.dataDir, tenantId, job.id);
      if (!pending) return json404("no pending commit for this import");
      if (verb === "apply") {
        const out = applyPendingFileImport(ctx.dataDir, tenantId, pending.approvalActionId, tenantId);
        if (!out.ok) return jsonError(out.error);
        const fresh = getJob(ctx.dataDir, tenantId, job.id);
        return Response.json({ data: { status: "applied", committed: out.committed, skipped: out.skipped, alreadyApplied: !!out.alreadyApplied, import: fresh ? publicJob(fresh) : null } });
      }
      const out = rejectFileImportWrite(ctx.dataDir, tenantId, pending.approvalActionId, tenantId);
      if (!out.ok) return jsonError(out.error ?? "reject failed");
      return Response.json({ data: { status: "rejected" } });
    }
    return json404("Unknown file-import endpoint");
  }

  // DELETE /api/native/import/file/:id — discard a DRAFT/staged job record.
  // This removes the staging record only: rows already committed to a store
  // stay there (an import never deletes data it did not create).
  if (seg.length === 1 && method === "DELETE") {
    if (job.status === "committed") return jsonError("a committed import cannot be deleted — its records are in the target store");
    deleteJobRecord(ctx.dataDir, tenantId, job.id);
    return Response.json({ data: { status: "deleted", id: job.id } });
  }

  return json404("Unknown file-import endpoint");
}

export function handleNativeFileImportAuthed(req: Request, ctx: NativeFileImportCtx): Promise<Response> {
  return handleAuthed(req, ctx);
}

/** Re-exported for tests and for the apply path's callers. */
export { getPendingWriteById };
