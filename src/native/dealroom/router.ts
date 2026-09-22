/**
 * native/dealroom/router.ts — HTTP surface for Phase 2.4 deal rooms.
 *
 * AUTHED (tenant): /api/native/dealroom* — list/create/view/update/archive/
 * delete + writes/apply + audit. Reads are tenant-scoped (ctx.userEmail);
 * every mutation is a GATED write (gate.ts). 404 on any foreign/unknown deal
 * room id (fail-closed, no IDOR).
 *
 * PUBLIC (client): GET /api/native/dealroom/share/:slug — a READ-ONLY view of
 * the deal room for the customer: deal name/customer/status, the linked
 * proposal's safe summary + its existing share path (never the proposal id
 * internals beyond what proposals already expose), and the linked checklist's
 * progress % WITHOUT internal ids or audit. NO writes on the public path
 * (any non-GET → 405).
 *
 * Route parsing uses EXPLICIT SEGMENTS, not a two-capture regex — avoids the
 * Phase 1.4 rowMatch/idMatch shadowing bug class entirely (2.1/2.3 discipline).
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  listDealRooms,
  getDealRoom,
  lookupDealRoomShareTenant,
  getDealRoomBySlug,
  listPendingWrites,
  getPendingWriteById,
  listAudit,
} from "./store";
import { submitDealRoomWrite, executePendingDealRoomWrite, noteOwnerDecision, createDealRoomMutationFromInput } from "./gate";
import { isDealRoomId } from "./validate";
import { getProposal } from "../proposals/store";
import { formatCurrencyTotal } from "../proposals/gate";
import { getChecklist } from "../checklists/store";
import { listInvoices } from "../invoice/store";

export interface NativeDealRoomsCtx {
  dataDir: string;
  userEmail: string; // tenant id
}
export interface NativeDealRoomsPublicCtx {
  dataDir: string;
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
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 500 });
}

/** Tenant-facing summary (full record minus nothing — internal surface). */
function summary(d: {
  id: string;
  name: string;
  customerName: string;
  customerEmail: string;
  description: string;
  linkedProposalId: string;
  linkedChecklistId: string | null;
  status: string;
  shareSlug: string | null;
  version: number;
  updatedAt: string;
}) {
  return d;
}

/**
 * Client-facing share view — read-only. Proposal is exposed as a safe summary
 * plus (when the proposal has a share slug) a link to its existing public
 * share path; checklist progress % only (no internal ids, no audit). Both the
 * proposal and the checklist are resolved INSIDE the deal room's tenant
 * (tenantId comes from the slug→tenant index) — a dangling link degrades to
 * null instead of leaking or guessing.
 */
function publicShareView(dataDir: string, tenantId: string, d: {
  id: string;
  name: string;
  customerName: string;
  description: string;
  linkedProposalId: string;
  linkedChecklistId: string | null;
  status: string;
  updatedAt: string;
}): Record<string, unknown> {
  const proposal = getProposal(dataDir, tenantId, d.linkedProposalId);
  return {
    dealRoomId: d.id,
    name: d.name,
    customerName: d.customerName,
    status: d.status,
    description: d.description,
    proposal: proposal
      ? {
          title: proposal.title,
          status: proposal.status,
          total: formatCurrencyTotal(proposal),
          hasPdf: proposal.docId !== null,
          sharePath: proposal.shareSlug ? `/proposals/share/${proposal.shareSlug}` : null,
        }
      : null,
    checklist: d.linkedChecklistId
      ? (() => {
          const chk = getChecklist(dataDir, tenantId, d.linkedChecklistId!);
          return chk
            ? { progress: chk.progress, percentDone: chk.progress.total > 0 ? Math.round((chk.progress.done / chk.progress.total) * 100) : 0 }
            : null;
        })()
      : null,
    // Invoices for this deal room — SAFE SUMMARY ONLY (invoice number, currency,
    // amount in cents, status). No internal inv_ record ids, no docId, no audit —
    // resolved strictly inside the slug→tenant context (no cross-tenant leak).
    invoices: listInvoices(dataDir, tenantId)
      .filter((i) => i.linkedDealRoomId === d.id)
      .map((i) => ({
        invoiceNumber: i.invoiceNumber,
        currency: i.currency,
        amountDueCents: i.amountDueCents,
        status: i.status,
      })),
    updatedAt: d.updatedAt,
  };
}

async function handleAuthedAsync(req: Request, ctx: NativeDealRoomsCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/dealroom\/?/, "").split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const dataDir = ctx.dataDir;

  // ── /api/native/dealroom (index) — list / create ──
  if (seg.length === 0) {
    if (req.method === "GET") {
      return Response.json({ data: listDealRooms(dataDir, tenantId).map((d) => summary(d)) });
    }
    if (req.method === "POST") {
      const b = parseJsonObject(await req.text());
      // Fail-closed: a client-supplied id on create is by definition forged —
      // reject the RAW body BEFORE any normalization (the sanitized mutation
      // drops extraneous keys, so the raw check must happen here, mirroring
      // the checklists 2.3 rejectRawIds discipline).
      if (b.id !== undefined) return json400("invalid id on create (ids are server-assigned)");
      const data = createDealRoomMutationFromInput(b);
      const res = submitDealRoomWrite(dataDir, tenantId, "create", { data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", dealRoomId: res.dealRoom.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/dealroom/writes — pending writes + apply/reject decisions ──
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({
        data: listPendingWrites(dataDir, tenantId).map((w) => ({
          id: w.id,
          op: w.op,
          dealRoomId: w.dealRoomId,
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
      if (!ptw || ptw.tenantId !== tenantId) return json404("no pending write for this deal room action");
      if (seg[2] === "reject") {
        noteOwnerDecision(dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
        return Response.json({ data: { status: "rejected", id: ptw.id } });
      }
      const res = executePendingDealRoomWrite(dataDir, tenantId, ptw.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      return Response.json({ data: { status: res.alreadyApplied ? "alreadyApplied" : "applied", dealRoomId: res.record.id, alreadyApplied: !!res.alreadyApplied } });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/dealroom/audit ──
  if (seg[0] === "audit") {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    return Response.json({ data: listAudit(dataDir, tenantId) });
  }

  // ── /api/native/dealroom/:id[/verb] ──
  if (!isDealRoomId(seg[0])) return json404("Unknown native dealroom endpoint");
  const dealRoomId = seg[0];
  const dealRoom = getDealRoom(dataDir, tenantId, dealRoomId);
  if (!dealRoom) return json404("Deal room not found"); // foreign/stranger → 404 (no IDOR)

  if (seg.length === 1) {
    if (req.method === "GET") return Response.json({ data: summary(dealRoom) });
    if (req.method === "DELETE") {
      const res = submitDealRoomWrite(dataDir, tenantId, "delete", { dealRoomId, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    if (req.method === "POST") {
      // POST /:id with a body = update (name/customer/links/status-draft↔active…)
      const b = parseJsonObject(await req.text());
      if (b.id !== undefined) return json400("invalid id on update (ids are server-assigned)");
      const data = createDealRoomMutationFromInput(b);
      const res = submitDealRoomWrite(dataDir, tenantId, "update", { dealRoomId, data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", dealRoomId: res.dealRoom.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/dealroom/:id/<verb> — lifecycle transitions ──
  const verb = seg[1];
  if (verb === "archive") {
    const res = submitDealRoomWrite(dataDir, tenantId, "archive", { dealRoomId, via: "portal" }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", dealRoomId: res.dealRoom.id, autonomy: res.autonomy } });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error);
  }
  return json404("Unknown native dealroom endpoint");
}

export function handleNativeDealRoomsAuthed(req: Request, ctx: NativeDealRoomsCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
    return Response.json({ error: "Internal error" }, { status: 500 });
  });
}

// ── PUBLIC share (read-only client view) ────────────────────────────────────
async function handleShareAsync(req: Request, ctx: NativeDealRoomsPublicCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/dealroom\/share\/?/, "").split("/").filter(Boolean);
  if (seg.length !== 1 || !/^dr_[A-Za-z0-9_-]+$/.test(seg[0])) return json404("Unknown deal room share link");
  const slug = seg[0];
  const tenantId = lookupDealRoomShareTenant(ctx.dataDir, slug);
  if (!tenantId) return json404("Unknown deal room share link");
  const dealRoom = getDealRoomBySlug(ctx.dataDir, tenantId, slug);
  if (!dealRoom) return json404("Unknown deal room share link"); // slug stale → fail-closed
  if (req.method !== "GET") return json405();
  return Response.json({ data: publicShareView(ctx.dataDir, tenantId, dealRoom) });
}
function json405(): Response {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export function handleNativeDealRoomShare(req: Request, ctx: NativeDealRoomsPublicCtx): Promise<Response> {
  return handleShareAsync(req, ctx).catch(() => Response.json({ error: "Internal error" }, { status: 500 }));
}

// ── Built-in typed events (Phase 1.1 registry pattern, 2.1/2.3) ─────────────
export function registerBuiltinNativeDealRoomEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.dealRoomId !== "string" || typeof p.eventId !== "string") {
        return { ok: false, reason: "payload needs dealRoomId and eventId" };
      }
      return { ok: true };
    },
  };
  for (const t of ["native.dealroom.created", "native.dealroom.updated", "native.dealroom.archived", "native.dealroom.deleted"]) {
    registerNativeEventType(t, base);
  }
}