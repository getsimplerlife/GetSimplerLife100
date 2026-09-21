/**
 * native/checklists/router.ts — HTTP surface for Phase 2.3 checklists.
 *
 * AUTHED (tenant): /api/native/checklists* — list/create/view/update/close/
 * delete + writes/apply + audit. Reads are tenant-scoped (ctx.userEmail);
 * every mutation is a GATED write (gate.ts). 404 on any foreign/unknown
 * checklist id (fail-closed, no IDOR). No public surface yet — the client
 * view arrives with the deal room (2.4).
 *
 * Route parsing uses EXPLICIT SEGMENTS, not a two-capture regex — avoids the
 * Phase 1.4 rowMatch/idMatch shadowing bug class entirely.
 */
import {
  listChecklists,
  getChecklist,
  listPendingWrites,
  getPendingWriteById,
  listAudit,
} from "./store";
import { submitChecklistWrite, executePendingChecklistWrite, noteOwnerDecision, createMutationFromInput } from "./gate";
import { registerNativeEventType } from "../webhooks/registry";

export interface NativeChecklistsCtx {
  dataDir: string;
  userEmail: string; // tenant id
}

// ── helpers ─────────────────────────────────────────────────────────────────
function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Body must be a JSON object");
    return v as Record<string, unknown>;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON body: ${msg}`);
  }
}
const json400 = (error: string) => Response.json({ error }, { status: 400 });
const json404 = (error: string) => Response.json({ error }, { status: 404 });
function gateErrorStatus(error: string): Response {
  const nf = /not found|no pending write|already applied|already decided/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 500 });
}

/** Tenant-facing summary (full record minus nothing — internal surface). */
function summary(c: { id: string; name: string; kind: string; status: string; progress: { done: number; total: number }; linkedProposalId: string | null; updatedAt: string; version: number; description: string; items: { id: string; title: string; status: string; assignee?: string; completedAt?: string }[] }) {
  return c;
}

async function handleAsync(req: Request, ctx: NativeChecklistsCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/checklists\/?/, "").split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const dataDir = ctx.dataDir;

  // ── /api/native/checklists (index) — list / create ──
  if (seg.length === 0) {
    if (req.method === "GET") {
      return Response.json({ data: listChecklists(dataDir, tenantId).map((c) => summary(c)) });
    }
    if (req.method === "POST") {
      const b = parseJsonObject(await req.text());
      const data = createMutationFromInput(b);
      const res = submitChecklistWrite(dataDir, tenantId, "create", { data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", checklistId: res.checklist.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/checklists/writes — pending writes + apply/reject decisions ──
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({
        data: listPendingWrites(dataDir, tenantId).map((w) => ({
          id: w.id,
          op: w.op,
          checklistId: w.checklistId,
          status: w.status,
          approvalActionId: w.approvalActionId,
          via: w.payload.via ?? "portal",
          requestedBy: w.requestedBy,
          requestedAt: w.requestedAt,
        })),
      });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject")) {
      if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      const ptw = getPendingWriteById(dataDir, tenantId, seg[1]);
      if (!ptw || ptw.tenantId !== tenantId) return json404("no pending write for this checklist action");
      if (seg[2] === "reject") {
        noteOwnerDecision(dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
        return Response.json({ data: { status: "rejected", id: ptw.id } });
      }
      const res = executePendingChecklistWrite(dataDir, tenantId, ptw.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      return Response.json({ data: { status: res.alreadyApplied ? "alreadyApplied" : "applied", checklistId: res.record.id, alreadyApplied: !!res.alreadyApplied } });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/checklists/audit ──
  if (seg[0] === "audit") {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    return Response.json({ data: listAudit(dataDir, tenantId) });
  }

  // ── /api/native/checklists/:id[/verb] ──
  const checklistId = seg[0];
  if (!/^chk_[A-Za-z0-9]+$/.test(checklistId)) return json404("Unknown native checklists endpoint");
  const checklist = getChecklist(dataDir, tenantId, checklistId);
  if (!checklist) return json404("Checklist not found"); // foreign/stranger → 404 (no IDOR)

  if (seg.length === 1) {
    if (req.method === "GET") return Response.json({ data: summary(checklist) });
    if (req.method === "DELETE") {
      const res = submitChecklistWrite(dataDir, tenantId, "delete", { checklistId, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    if (req.method === "POST") {
      // POST /:id with a body = update (name/description/kind/items…)
      const b = parseJsonObject(await req.text());
      const data = createMutationFromInput(b);
      const res = submitChecklistWrite(dataDir, tenantId, "update", { checklistId, data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", checklistId: res.checklist.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/checklists/:id/<verb> — lifecycle transitions ──
  const verb = seg[1];
  if (verb === "close") {
    const res = submitChecklistWrite(dataDir, tenantId, "close", { checklistId, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", checklistId: res.checklist.id, autonomy: res.autonomy } });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error);
  }
  return json404("Unknown native checklists endpoint");
}

export function handleNativeChecklistsAuthed(req: Request, ctx: NativeChecklistsCtx): Promise<Response> {
  return handleAsync(req, ctx).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
    return Response.json({ error: "Internal error" }, { status: 500 });
  });
}

// ── Built-in typed events (Phase 1.1 registry pattern, see proposals 2.1) ────
export function registerBuiltinNativeChecklistEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.checklistId !== "string" || typeof p.eventId !== "string") {
        return { ok: false, reason: "payload needs checklistId and eventId" };
      }
      return { ok: true };
    },
  };
  for (const t of ["native.checklist.created", "native.checklist.updated", "native.checklist.closed", "native.checklist.deleted"]) {
    registerNativeEventType(t, base);
  }
}