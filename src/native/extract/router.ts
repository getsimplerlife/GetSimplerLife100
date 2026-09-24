/**
 * native/extract/router.ts — HTTP surface for Phase 3.3 native AI document
 * understanding (/api/native/extract*).
 *
 * AUTHED (tenant) ONLY: list vault documents + extraction drafts, gated
 * extraction runs (extractDocument — Approval Queue), draft review
 * (reject lane, 5b precedent), the row-data helper (pre-fill for the 1.4
 * records write — read-only), and the pending-write decision lanes.
 * Reads are tenant-scoped (ctx.userEmail); the RUN is a GATED write (gate.ts).
 * 404 on any foreign/unknown id (fail-closed, no IDOR); NO public surface —
 * prod-server wires this block AFTER the session check → 401 fail-closed.
 *
 * The record WRITE itself is performed by the tenant through the TABLES
 * slice's own gated insert (POST /api/native/tables/:id/rows, createTableRow)
 * using row-data pre-fill from here — the approval-gated write to records
 * reuses the proven 1.4 path (no double-queue, no new write verb).
 *
 * Route parsing uses EXPLICIT SEGMENTS (no two-capture regex) — the Phase 1.4
 * rowMatch/idMatch shadowing bug class is avoided entirely.
 */
import { registerNativeEventType } from "../webhooks/registry";
import { listVaultDocuments } from "../../lib/vault-store";
import { listExtractions, getExtraction, summarize } from "../../lib/extraction/extraction-store";
import { rejectExtraction } from "../../lib/extraction/extraction-gate";
import { getTable, listTables } from "../tables/store";
import {
  executePendingExtractWrite,
  noteOwnerDecision,
  submitExtractWrite,
  type ExtractRunnerDeps,
} from "./gate";
import { listPendingWrites, getPendingWriteById } from "./store";

export interface NativeExtractCtx {
  userEmail: string;
  dataDir: string;
  /** Injectable at run time (tests use MockModelClient); prod leaves undefined. */
  extractDeps?: ExtractRunnerDeps;
}

const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
const json401 = () => Response.json({ error: "Not authenticated" }, { status: 401 });
const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown|LLM|disabled/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 400 });
}

function docSummary(d: ReturnType<typeof listVaultDocuments>[number]): Record<string, unknown> {
  return {
    id: d.id,
    name: d.name,
    ext: d.versions[d.versions.length - 1]?.ext ?? null,
    mime: d.versions[d.versions.length - 1]?.mime ?? null,
    size: d.versions[d.versions.length - 1]?.size ?? 0,
    version: d.version,
    sha256: d.versions[d.versions.length - 1]?.sha256 ?? "",
    status: d.status,
    createdAt: d.createdAt,
  };
}

/** Build row data for a target TABLE from an extraction draft (read-only
 *  pre-fill helper — the gated record write happens via the tables slice). */
function buildRowData(extraction: ReturnType<typeof getExtraction>, table: ReturnType<typeof getTable>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (!extraction || !table) return row;
  for (const f of table.fields) {
    const hit = (extraction.fields || []).find((x) => x.key === f.key);
    row[f.key] = hit ? hintValue(hit) : "";
  }
  return row;
}
function hintValue(f: { value: string; numberValue?: number | null; dateValue?: string | null }): string | number {
  if (f.numberValue !== undefined && f.numberValue !== null) return f.numberValue;
  if (f.dateValue) return f.dateValue;
  return f.value;
}

async function handleAuthedAsync(req: Request, ctx: NativeExtractCtx): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/native\/extract\/?/, "");
  const seg = path.split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  if (!tenantId) return json401();

  // ── Top-level: documents + extraction drafts (tenant-only) ────────────────
  if (seg.length === 0 && req.method === "GET") {
    return Response.json({
      data: {
        documents: listVaultDocuments(ctx.dataDir, tenantId).map(docSummary),
        extractions: summarize(listExtractions(ctx.dataDir, tenantId)),
        tables: listTables(ctx.dataDir, tenantId).map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          fields: t.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required ?? false })),
        })),
      },
    });
  }

  // ── Gated extraction run: POST documents/:docId/extract ──────────────────
  if (seg[0] === "documents" && seg.length === 3 && seg[2] === "extract" && req.method === "POST") {
    const documentId = seg[1];
    if (!/^doc_[A-Za-z0-9_-]+$/.test(documentId || "")) return json404("Unknown native extract endpoint");
    const res = await submitExtractWrite(ctx.dataDir, tenantId, "extract", { documentId, via: "portal" }, tenantId, ctx.extractDeps);
    if (res.applied) return Response.json({ data: { status: "applied", resultId: res.resultId, autonomy: res.autonomy } });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error ?? "extract write failed");
  }

  // ── Extraction drafts ─────────────────────────────────────────────────────
  if (seg[0] === "results") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({ data: { extractions: summarize(listExtractions(ctx.dataDir, tenantId)) } });
    }
    if (seg.length === 2) {
      const resultId = seg[1];
      if (!/^ext_[A-Za-z0-9_-]+$/.test(resultId || "")) return json404("Unknown native extract endpoint");
      const extraction = getExtraction(ctx.dataDir, tenantId, resultId);
      if (!extraction) return json404("Extraction result not found"); // foreign/stranger → 404 (no IDOR)
      if (req.method === "GET") {
        return Response.json({ data: { extraction } });
      }
      if (req.method === "POST" && req.url.endsWith(`/results/${resultId}/reject`)) {
        const out = rejectExtraction({ tenantEmail: tenantId, documentId: extraction.docId, resultId, actor: tenantId, dataDir: ctx.dataDir });
        if (!out.ok && !out.unchanged) return gateErrorStatus(out.error ?? "reject failed");
        return Response.json({ data: { status: "rejected", unchanged: !!out.unchanged } });
      }
    }
    if (seg.length === 3 && seg[2] === "reject" && req.method === "POST") {
      const resultId = seg[1];
      if (!/^ext_[A-Za-z0-9_-]+$/.test(resultId || "")) return json404("Unknown native extract endpoint");
      const extraction = getExtraction(ctx.dataDir, tenantId, resultId);
      if (!extraction) return json404("Extraction result not found");
      const out = rejectExtraction({ tenantEmail: tenantId, documentId: extraction.docId, resultId, actor: tenantId, dataDir: ctx.dataDir });
      if (!out.ok && !out.unchanged) return gateErrorStatus(out.error ?? "reject failed");
      return Response.json({ data: { status: "rejected", unchanged: !!out.unchanged } });
    }
    // Row-data pre-fill helper: GET results/:resultId/row-data?tableId=…
    if (seg.length === 3 && seg[2] === "row-data" && req.method === "GET") {
      const resultId = seg[1];
      const tableId = url.searchParams.get("tableId") || "";
      if (!/^ext_[A-Za-z0-9_-]+$/.test(resultId || "")) return json404("Unknown native extract endpoint");
      const extraction = getExtraction(ctx.dataDir, tenantId, resultId);
      if (!extraction) return json404("Extraction result not found");
      const table = getTable(ctx.dataDir, tenantId, tableId);
      if (!table) return json404("Table not found"); // foreign/stranger → 404 (no IDOR)
      return Response.json({ data: { tableId, tableName: table.name, rowData: buildRowData(extraction, table) } });
    }
    return json404("Unknown native extract endpoint");
  }

  // ── Pending writes (owner decision lanes) ─────────────────────────────────
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({ data: { writes: listPendingWrites(ctx.dataDir, tenantId) } });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject") && req.method === "POST") {
      const w = getPendingWriteById(ctx.dataDir, tenantId, seg[1]);
      if (!w || w.tenantId !== tenantId) return json404("no pending write for this extract action");
      if (seg[2] === "apply") {
        const res = await executePendingExtractWrite(ctx.dataDir, tenantId, w.approvalActionId, tenantId, ctx.extractDeps);
        if (!res.ok) return gateErrorStatus(res.reason);
        await noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "approved", tenantId, ctx.extractDeps);
        return Response.json({ data: { status: "applied", ptwId: res.ptwId, resultId: res.resultId, alreadyApplied: !!res.alreadyApplied } });
      }
      await noteOwnerDecision(ctx.dataDir, tenantId, w.approvalActionId, "rejected", tenantId, ctx.extractDeps);
      return Response.json({ data: { status: "rejected", ptwId: w.id } });
    }
    return json405();
  }

  return json404("Unknown native extract endpoint");
}

/** AUTHED handler (prod-server wires this AFTER the session check → 401 fail-closed). */
export function handleNativeExtractAuthed(req: Request, ctx: NativeExtractCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}

// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–3.2) ─────────────
export function registerBuiltinNativeExtractEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.eventId !== "string") return { ok: false, reason: "payload needs eventId" };
      return { ok: true };
    },
  };
  for (const t of [
    "native.extract.queued",
    "native.extract.draft.created",
    "native.extract.draft.rejected",
    "native.extract.capped",
    "native.extract.run.failed",
  ]) {
    registerNativeEventType(t, base);
  }
}