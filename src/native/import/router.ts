/**
 * native/import/router.ts — HTTP surface for Phase 5.1 (6.1) native IMPORT /
 * MIGRATION slice (client-optional import lanes, owner 10-20 direction:
 * "connect your existing tools to bring your data in" — we never run or write
 * through the client's tools). AUTHED ONLY (401 fail-closed upstream, NO
 * public share lane):
 *
 *   GET  /api/native/import                       list import jobs (paginated)
 *   POST /api/native/import                       create (gated)
 *   GET  /api/native/import/:impId                get job + staged counts
 *   POST /api/native/import/:impId/update         update (gated)
 *   POST /api/native/import/:impId/delete         delete (gated)
 *   POST /api/native/import/:impId/pull           pull snapshot (gated)
 *   POST /api/native/import/:impId/map            save field mapping (gated)
 *   POST /api/native/import/:impId/commit         submit tables import write (gated)
 *   POST /api/native/import/:impId/preview        READ-ONLY staged preview (never gates, never writes)
 *   GET  /api/native/import/:impId/runs           honest run ledger
 *   GET  /api/native/import/audit                 immutable native.import.* audit
 *   GET  /api/native/import/writes                pending mirror
 *   POST /api/native/import/writes/:imwId/apply|reject  APPROVE/REJECT paths
 *
 * Explicit-segment parsing; every read is tenant-scoped and safe-projected;
 * every mutation flows through gate.ts (validation BEFORE the gate; commit
 * rides the TABLES slice's existing gated importTableRows — no double-queue).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  KNOWN_IMPORT_PROVIDERS,
  executePendingImportWrite,
  hasImportSource,
  noteOwnerDecision,
  publicAudit,
  publicJob,
  publicRun,
  publicWrite,
  submitImportWrite,
} from "./gate";
import {
  appendAudit,
  getJob,
  getPendingWriteById,
  getStaging,
  listAudit,
  listJobs,
  listPendingWrites,
  listRuns,
} from "./store";
import { MAX_PAGE_SIZE, MAX_PREVIEW_ROWS, type ImportJob, type ImportOp } from "./types";
export interface NativeImportCtx {
  userEmail: string;
  dataDir: string;
}
const jsonError = (error: string, status = 400) => Response.json({ error }, { status });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  if (nf) return json404(error);
  return jsonError(error);
}
const RE = {
  imp: /^imp_[A-Za-z0-9]+$/,
  imw: /^imw_[A-Za-z0-9]+$/,
};
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
async function handleAuthed(req: Request, ctx: NativeImportCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/import\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const method = req.method;
  // GET /api/native/import — list (tenant-scoped, paginated)
  if (seg.length === 0 && method === "GET") {
    const { limit, offset } = pageParam(url);
    const jobs = listJobs(ctx.dataDir, tenantId);
    const page = jobs.slice(offset, offset + limit);
    return Response.json({ data: { imports: page.map(publicJob), total: jobs.length, limit, offset } });
  }
  // POST /api/native/import — create (gated)
  if (seg.length === 0 && method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
    const res = await submitImportWrite(ctx.dataDir, tenantId, "createImport", { payload: body as Record<string, unknown>, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", id: res.id, autonomy: res.autonomy } }, { status: 201 });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error ?? "create failed");
  }
  // GET /api/native/import/:impId — job detail + staged counts (stranger → 404)
  if (seg.length === 1 && method === "GET" && RE.imp.test(seg[0] ?? "")) {
    const job = getJob(ctx.dataDir, tenantId, seg[0]);
    if (!job) return json404("Import not found");
    const staging = getStaging(ctx.dataDir, tenantId, seg[0]);
    return Response.json({
      data: {
        import: publicJob(job),
        staged: staging ? { rows: staging.rows.length, byteLength: staging.byteLength, pulledAt: staging.pulledAt } : { rows: 0, byteLength: 0 },
      },
    });
  }
  // POST /api/native/import/:impId/preview — READ-ONLY: returns mapped staged
  // rows (bounded) + counts. NEVER gates, NEVER writes (no audit, no ledger,
  // no staging mutation). preview is a READ_VERB — fail-open guard intact.
  // (Ordered BEFORE the generic mutation branch so it is never shadowed.)
  if (seg.length === 2 && seg[1] === "preview" && method === "POST" && RE.imp.test(seg[0] ?? "")) {
    const job = getJob(ctx.dataDir, tenantId, seg[0]);
    if (!job) return json404("Import not found");
    const staging = getStaging(ctx.dataDir, tenantId, seg[0]);
    if (!staging) return Response.json({ data: { staged: 0, previewRows: [], mapped: 0, skipped: 0, note: "nothing staged yet" } });
    const preview = staging.rows.slice(0, MAX_PREVIEW_ROWS);
    return Response.json({ data: { staged: staging.rows.length, byteLength: staging.byteLength, previewRows: preview, note: "read-only preview — nothing was written or queued" } });
  }
  // POST /api/native/import/:impId/update|delete|pull|map|commit
  if (seg.length === 2 && method === "POST" && RE.imp.test(seg[0] ?? "")) {
    const verb = seg[1];
    const op: ImportOp | undefined =
      verb === "update" ? "updateImport" : verb === "delete" ? "deleteImport" : verb === "pull" ? "pullImportData" : verb === "map" ? "mapImportFields" : verb === "commit" ? "commitImport" : undefined;
    if (!op) return json404("Unknown native import endpoint");
    if (!getJob(ctx.dataDir, tenantId, seg[0])) return json404("Import not found"); // stranger/cross-tenant → 404 (no IDOR)
    const body = await req.json().catch(() => null);
    if (op === "mapImportFields") {
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = await submitImportWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), importId: seg[0] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    if (op === "updateImport") {
      if (!body || typeof body !== "object") return jsonError("body must be a JSON object");
      const res = await submitImportWrite(ctx.dataDir, tenantId, op, { payload: { ...(body as Record<string, unknown>), importId: seg[0] }, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error ?? "operation failed");
    }
    // pull / commit / delete take no meaningful body (or an empty object).
    const res = await submitImportWrite(ctx.dataDir, tenantId, op, { payload: { ...((body && typeof body === "object") ? body : {}), importId: seg[0] }, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", id: res.id } });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error ?? "operation failed");
  }
  // GET /api/native/import/:impId/runs — honest run ledger
  if (seg.length === 2 && seg[1] === "runs" && method === "GET" && RE.imp.test(seg[0] ?? "")) {
    if (!getJob(ctx.dataDir, tenantId, seg[0])) return json404("Import not found");
    const { limit, offset } = pageParam(url);
    const runs = listRuns(ctx.dataDir, tenantId, seg[0]);
    const page = runs.slice(offset, offset + limit);
    return Response.json({ data: { runs: page.map(publicRun), total: runs.length, limit, offset } });
  }
  // GET /api/native/import/audit — immutable audit
  if (seg.length === 1 && seg[0] === "audit" && method === "GET") {
    const { limit, offset } = pageParam(url);
    const audit = listAudit(ctx.dataDir, tenantId);
    const page = audit.slice(offset, offset + limit);
    return Response.json({ data: { audit: page.map(publicAudit), total: audit.length, limit, offset } });
  }
  // GET /api/native/import/writes — pending mirror (safe projection: no payloads)
  if (seg.length === 1 && seg[0] === "writes") {
    if (method !== "GET") return json405();
    return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId).map(publicWrite) } });
  }
  // POST /api/native/import/writes/:imwId/apply|reject — APPROVE/REJECT paths
  if (
    seg.length === 3 &&
    (seg[0] === "writes" || seg[0] === "writes/") &&
    (seg[2] === "apply" || seg[2] === "reject") &&
    method === "POST" &&
    RE.imw.test(seg[1] ?? "")
  ) {
    const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
    if (!w || w.tenantId !== tenantId) return json404("no pending write for this import action");
    if (seg[2] === "apply") {
      const res = await executePendingImportWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      return Response.json({ data: { status: "applied", imwId: res.imwId, alreadyApplied: !!res.alreadyApplied, committed: res.committed } });
    }
    await noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId);
    return Response.json({ data: { status: "rejected", imwId: w.id } });
  }
  // GET /api/native/import/lanes — available import lanes (client-optional
  // sources; read-only catalog — honest: wires status reported per lane).
  if (seg.length === 1 && seg[0] === "lanes" && method === "GET") {
    const lanes = KNOWN_IMPORT_PROVIDERS.map((p) => ({ provider: p, wired: hasImportSource(p) }));
    return Response.json({ data: { lanes } });
  }
  return json404("Unknown native import endpoint");
}
export function handleNativeImportAuthed(req: Request, ctx: NativeImportCtx): Promise<Response> {
  return handleAuthed(req, ctx);
}
export function registerBuiltinNativeImportEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.import.created",
    "native.import.updated",
    "native.import.deleted",
    "native.import.pulled",
    "native.import.mapped",
    "native.import.committed",
    "native.import.pending",
    "native.import.applied",
    "native.import.rejected",
    "native.import.failed",
  ]) {
    registerNativeEventType(t, base);
  }
}
export { appendAudit as appendImportAudit, listJobs, getJob, listRuns, listAudit, listPendingWrites };
export type { ImportJob, ImportOp };