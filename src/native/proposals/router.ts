/**
 * native/proposals/router.ts — HTTP surface for Phase 2.1 proposals.
 *
 * AUTHED (tenant): /api/native/proposals* — list/create/view/update/open/
 * approve/reject/send/delete/pdf + writes/apply + audit. Reads are
 * tenant-scoped (ctx.userEmail); every mutation is a GATED write (gate.ts).
 * 404 on any foreign/unknown proposal id (fail-closed, no IDOR).
 *
 * PUBLIC (client): /api/native/proposals/share/:slug — GET summary + POST
 * approve/reject (the CLIENT decision). Slug-gated like forms (1.3): the
 * global index maps slug → tenant ONLY; unknown slug → 404. The decision
 * queues a TENANT-side approval card (the proposal status never changes
 * until the owner approves in the queue — approval of the proposal rides
 * the Approval Queue).
 *
 * Route parsing uses EXPLICIT SEGMENTS, not a two-capture regex — avoids the
 * Phase 1.4 rowMatch/idMatch shadowing bug class entirely.
 */
import { registerNativeEventType } from "../webhooks/registry";
import {
  listProposals,
  getProposal,
  getProposalBySlug,
  lookupShareTenant,
  listPendingWrites,
  getPendingWriteById,
  listAudit,
  generateProposalEntityId,
} from "./store";
import { submitProposalWrite, executePendingProposalWrite, noteOwnerDecision, formatCurrencyTotal } from "./gate";
import { readDocumentBytes, getDoc } from "../documents/store";
import { normalizeLineItems, validateProposalMutation, validateLineItem } from "./validate";
import { MAX_SIGNER_NAME, type ProposalRecord, type ProposalMutation } from "./types";

export interface NativeProposalsCtx {
  dataDir: string;
  userEmail: string; // tenant id
}
export interface NativeProposalsPublicCtx {
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
  const bad = /required|must|cap reached|cannot|invalid|at least|failed/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 500 });
}

/** Mutation parsed from a request body (create/update). */
function mutationFromBody(body: Record<string, unknown>): ProposalMutation {
  const m: ProposalMutation = {};
  if (typeof body.title === "string") m.title = body.title;
  if (typeof body.clientName === "string") m.clientName = body.clientName;
  if (typeof body.clientEmail === "string") m.clientEmail = body.clientEmail;
  if (typeof body.clientCompany === "string") m.clientCompany = body.clientCompany;
  if (typeof body.currency === "string") m.currency = body.currency;
  if (typeof body.terms === "string") m.terms = body.terms;
  if (typeof body.validityDays === "number") m.validityDays = body.validityDays;
  if (body.lineItems !== undefined) m.lineItems = normalizeLineItems(body.lineItems) ?? undefined;
  return m;
}

/** Tenant-facing summary (no share internals beyond the share path). */
export function publicSummary(p: ProposalRecord, origin?: string): Record<string, unknown> {
  return {
    id: p.id,
    title: p.title,
    clientName: p.clientName,
    clientCompany: p.clientCompany,
    status: p.status,
    currency: p.currency,
    total: formatCurrencyTotal(p),
    totalCents: p.lineItems.reduce((s, li) => s + Math.round(Math.round(li.unitPrice * 100) * li.qty), 0),
    validityDays: p.validityDays,
    version: p.version,
    hasPdf: p.docId !== null,
    shareUrl: p.shareSlug ? `${origin ?? ""}/proposals/share/${p.shareSlug}` : null,
    updatedAt: p.updatedAt,
  };
}

/** Client-facing view of a share — line items + terms + totals (no tenant internals). */
export function publicShareView(p: ProposalRecord): Record<string, unknown> {
  return {
    proposalId: p.id,
    title: p.title,
    clientName: p.clientName,
    clientCompany: p.clientCompany,
    status: p.status,
    currency: p.currency,
    lineItems: p.lineItems.map((li) => ({ description: li.description, qty: li.qty, unitPrice: li.unitPrice })),
    total: formatCurrencyTotal(p),
    totalCents: p.lineItems.reduce((s, li) => s + Math.round(Math.round(li.unitPrice * 100) * li.qty), 0),
    terms: p.terms,
    validityDays: p.validityDays,
    issuedAt: p.createdAt,
  };
}

async function handleAuthedAsync(req: Request, ctx: NativeProposalsCtx): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const seg = pathname.replace(/^\/api\/native\/proposals\/?/, "").split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const dataDir = ctx.dataDir;

  // ── /api/native/proposals (index) — list / create ──
  if (seg.length === 0) {
    if (req.method === "GET") {
      const list = listProposals(dataDir, tenantId).map((p) => publicSummary(p, url.origin));
      return Response.json({ data: list });
    }
    if (req.method === "POST") {
      const b = parseJsonObject(await req.text());
      const data = mutationFromBody(b);
      const res = submitProposalWrite(dataDir, tenantId, "create", { data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", proposalId: res.proposal.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/proposals/writes — pending writes + apply/reject decisions ──
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      const writes = listPendingWrites(dataDir, tenantId).map((w) => ({
        id: w.id,
        op: w.op,
        proposalId: w.proposalId,
        status: w.status,
        approvalActionId: w.approvalActionId,
        via: w.payload.via ?? "portal",
        requestedBy: w.requestedBy,
        requestedAt: w.requestedAt,
      }));
      return Response.json({ data: writes });
    }
    if (seg.length === 3 && (seg[2] === "apply" || seg[2] === "reject")) {
      if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
      const ptw = getPendingWriteById(dataDir, tenantId, seg[1]);
      if (!ptw || ptw.tenantId !== tenantId) return json404("no pending write for this proposal action");
      if (seg[2] === "reject") {
        // Owner-side reject of the card + write (approve path stays noteOwnerDecision).
        noteOwnerDecision(dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
        return Response.json({ data: { status: "rejected", id: ptw.id } });
      }
      const res = executePendingProposalWrite(dataDir, tenantId, ptw.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      return Response.json({ data: { status: res.alreadyApplied ? "alreadyApplied" : "applied", proposalId: res.record.id, alreadyApplied: !!res.alreadyApplied } });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/proposals/audit ──
  if (seg[0] === "audit") {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    return Response.json({ data: listAudit(dataDir, tenantId) });
  }

  // ── /api/native/proposals/:id[/verb] — all gated verbs are verb-first actions
  const proposalId = seg[0];
  if (!/^prop_[A-Za-z0-9]+$/.test(proposalId)) return json404("Unknown native proposals endpoint");
  const proposal = getProposal(dataDir, tenantId, proposalId);
  if (!proposal) return json404("Proposal not found"); // foreign/stranger → 404 (no IDOR)

  if (seg.length === 1) {
    if (req.method === "GET") {
      return Response.json({ data: { ...publicSummary(proposal, url.origin), clientEmail: proposal.clientEmail, shareSlug: proposal.shareSlug, docId: proposal.docId, terms: proposal.terms, lineItems: proposal.lineItems } });
    }
    if (req.method === "DELETE") {
      const res = submitProposalWrite(dataDir, tenantId, "delete", { proposalId, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    if (req.method === "POST") {
      // POST /:id with a body = update (title/client/lineItems/terms…)
      const b = parseJsonObject(await req.text());
      const data = mutationFromBody(b);
      const res = submitProposalWrite(dataDir, tenantId, "update", { proposalId, data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", proposalId: res.proposal.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/proposals/:id/pdf — download the latest generated PDF ──
  if (seg[1] === "pdf") {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (!proposal.docId) return json404("No PDF generated yet for this proposal");
    const doc = getDoc(dataDir, tenantId, proposal.docId);
    if (!doc) return json404("PDF record missing");
    const bytes = readDocumentBytes(dataDir, tenantId, proposal.docId);
    if (!bytes) return json404("PDF bytes missing");
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${proposal.id}.pdf"`,
        "cache-control": "no-store",
      },
    });
  }

  // ── /api/native/proposals/:id/<verb> — gated lifecycle transitions ──
  const verb = seg[1];
  const res = submitProposalWrite(dataDir, tenantId, verb as "update" | "open" | "approve" | "reject" | "send", { proposalId, via: "portal" }, tenantId);
  if (res.applied) return Response.json({ data: { status: "applied", proposalId: res.proposal.id, autonomy: res.autonomy } });
  if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
  return gateErrorStatus(res.error);
}

// ── AUTHED router (exported for prod-server) ────────────────────────────────
export function handleNativeProposalsAuthed(req: Request, ctx: NativeProposalsCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
    return Response.json({ error: "Internal error" }, { status: 500 });
  });
}

// ── PUBLIC share (client view + decision) ───────────────────────────────────
async function handleShareAsync(req: Request, ctx: NativeProposalsPublicCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/proposals\/share\/?/, "").split("/").filter(Boolean);
  if (seg.length !== 1 || !/^sp_[A-Za-z0-9_-]+$/.test(seg[0])) return json404("Unknown proposal share link");
  const slug = seg[0];
  const tenantId = lookupShareTenant(ctx.dataDir, slug);
  if (!tenantId) return json404("Unknown proposal share link");
  const proposal = getProposalBySlug(ctx.dataDir, tenantId, slug);
  if (!proposal) return json404("Unknown proposal share link"); // slug stale → fail-closed
  if (req.method === "GET") {
    return Response.json({ data: publicShareView(proposal) });
  }
  if (req.method === "POST") {
    const b = parseJsonObject(await req.text());
    const decision = b.decision;
    if (decision !== "approve" && decision !== "reject") return json400("decision must be \"approve\" or \"reject\"");
    if (proposal.status !== "pending") {
      return Response.json({ error: `Proposal already decided (status ${proposal.status})` }, { status: 409 });
    }
    let signerName = "";
    if (typeof b.signerName === "string" && b.signerName.trim().length > 0) {
      if (b.signerName.trim().length > MAX_SIGNER_NAME) return json400(`signerName must be ≤ ${MAX_SIGNER_NAME} chars`);
      signerName = b.signerName.trim();
    }
    const res = submitProposalWrite(ctx.dataDir, tenantId, decision, { proposalId: proposal.id, via: "client-decision", signerName: signerName || undefined }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", decision, autonomy: res.autonomy } });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error);
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

export function handleNativeProposalShare(req: Request, ctx: NativeProposalsPublicCtx): Promise<Response> {
  return handleShareAsync(req, ctx).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
    return Response.json({ error: "Internal error" }, { status: 500 });
  });
}

// ── Built-in typed events (Phase 1.1 registry pattern, see forms 1.3) ────────
export function registerBuiltinNativeProposalEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.proposalId !== "string" || typeof p.eventId !== "string") {
        return { ok: false, reason: "payload needs proposalId and eventId" };
      }
      return { ok: true };
    },
  };
  for (const t of ["native.proposal.created", "native.proposal.updated", "native.proposal.approved", "native.proposal.rejected"]) {
    registerNativeEventType(t, base);
  }
}
export { generateProposalEntityId, validateProposalMutation, validateLineItem };