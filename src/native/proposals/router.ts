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
// SLICE 192b-2 — the client-facing issuer name, from the ONE resolver the
// invoice page, PDF and delivery email already use (native/invoice/issuer.ts).
import { resolveIssuerDisplayName } from "../invoice/issuer";
import { readDocumentBytes, getDoc } from "../documents/store";
// SLICE 192b-3 — the public decision POST is rate-limited on the TRUSTED peer
// address (finding #9), and a refusal that came from the approval STORE must
// not be echoed back as an internal path (finding #10).
import { createProposalPostLimiter, PROPOSAL_POST_LIMIT, PROPOSAL_POST_WINDOW_MS, type ProposalPostLimiter } from "./ratelimit";
import { publicWriteRateKey } from "../booking/ratelimit";
import { isApprovalStoreUnavailable } from "../../lib/approval-queue";
import { normalizeLineItems, validateProposalMutation, validateLineItem, validateSignatureInput, proposalSignedContent } from "./validate";
import {
  MAX_SIGNER_NAME,
  isProposalExpired,
  isProposalPubliclyShareable,
  type ProposalRecord,
  type ProposalMutation,
  type ProposalSignatureInput,
} from "./types";

export interface NativeProposalsCtx {
  dataDir: string;
  userEmail: string; // tenant id
}
export interface NativeProposalsPublicCtx {
  dataDir: string;
  /** Rate limiter for the public decision POST (shared process-wide unless injected for tests). */
  limiter?: ProposalPostLimiter;
  /**
   * SLICE 192b-3 (finding #20) — the SOCKET peer address from
   * `peerAddressFrom(server, req)`, supplied by prod-server. The limiter keys on
   * this, never on the caller-controlled `x-forwarded-for` header. Absent → all
   * anonymous callers share one bucket (stricter, never a bypass).
   */
  peerAddress?: string | null;
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
    // SLICE 192b — the tenant surface states the SAME publish answer the public
    // lane enforces, from the same predicate, so the portal can never print a
    // customer link the server would refuse to open.
    publiclyShareable: isProposalPubliclyShareable(p.status),
    issuedAt: p.issuedAt ?? null,
    expiresAt: p.expiresAt ?? null,
    expired: isProposalExpired(p),
    updatedAt: p.updatedAt,
  };
}

/**
 * Client-facing view of a share — line items + terms + totals (no tenant internals).
 *
 * SLICE 192b — three fields here used to be guesses:
 *   - `signable` was `status === "pending"`, so an expired quote stayed signable
 *     forever. It is now the SAME predicate the decision POST refuses on.
 *   - `issuedAt` was `createdAt` and the page printed it as "Issued" (191's
 *     `issuedAtSource` fix, never applied here). It is now the day the quote was
 *     OPENED, with `issuedAtSource` saying which date the client is looking at.
 *   - `expiresAt` did not exist: "Valid for N days" was printed and enforced
 *     nowhere. It is now computed at `open` from `validityDays`.
 */
export function publicShareView(p: ProposalRecord, now: number | string | Date = Date.now(), issuerName = ""): Record<string, unknown> {
  const expired = isProposalExpired(p, now);
  return {
    proposalId: p.id,
    title: p.title,
    clientName: p.clientName,
    clientCompany: p.clientCompany,
    // SLICE 192b-2 — the firm the client is dealing with. Never the tenant id:
    // `resolveIssuerDisplayName` can only return a vetted name or a neutral one.
    issuerName,
    status: p.status,
    signable: p.status === "pending" && !expired,
    currency: p.currency,
    lineItems: p.lineItems.map((li) => ({ description: li.description, qty: li.qty, unitPrice: li.unitPrice })),
    total: formatCurrencyTotal(p),
    totalCents: p.lineItems.reduce((s, li) => s + Math.round(Math.round(li.unitPrice * 100) * li.qty), 0),
    terms: p.terms,
    validityDays: p.validityDays,
    issuedAt: p.issuedAt ?? p.createdAt,
    issuedAtSource: p.issuedAt ? "opened" : "created",
    expiresAt: p.expiresAt ?? null,
    expired,
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
      const res = await submitProposalWrite(dataDir, tenantId, "create", { data, via: "portal" }, tenantId);
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
        await noteOwnerDecision(dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
        return Response.json({ data: { status: "rejected", id: ptw.id } });
      }
      const res = await executePendingProposalWrite(dataDir, tenantId, ptw.approvalActionId, tenantId);
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
      // SLICE 167 (D-16) — the read view the audit asked for. The detail
      // response carries the whole record the portal needs to show a quote:
      // line items, terms, client email, share slug and the e-signatures
      // captured on acceptance. Nothing new is stored; this only stops the
      // tenant from being unable to read a proposal it already owns.
      return Response.json({ data: { ...publicSummary(proposal, url.origin), clientEmail: proposal.clientEmail, shareSlug: proposal.shareSlug, docId: proposal.docId, terms: proposal.terms, lineItems: proposal.lineItems, signatures: proposal.signatures ?? [] } });
    }
    if (req.method === "DELETE") {
      const res = await submitProposalWrite(dataDir, tenantId, "delete", { proposalId, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    if (req.method === "POST") {
      // POST /:id with a body = update (title/client/lineItems/terms…)
      const b = parseJsonObject(await req.text());
      const data = mutationFromBody(b);
      const res = await submitProposalWrite(dataDir, tenantId, "update", { proposalId, data, via: "portal" }, tenantId);
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

  // ── POST /api/native/proposals/:id/share/revoke — kill the client link ──
  // SLICE 192b — before this the only way to retire a link was `delete`, which
  // destroyed the record. Revoking retires the slug, mints a fresh one and
  // leaves the status alone; the client's URL stops resolving while the quote
  // (and its audit trail) survives. Same gated-write path as every other
  // proposal mutation.
  if (seg[1] === "share" && seg[2] === "revoke" && seg.length === 3) {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const revoke = await submitProposalWrite(dataDir, tenantId, "revokeShare", { proposalId, via: "portal" }, tenantId);
    if (revoke.applied) {
      return Response.json({
        data: { status: "applied", proposalId: revoke.proposal.id, shareSlug: revoke.proposal.shareSlug, autonomy: revoke.autonomy },
      });
    }
    if (revoke.pending) return Response.json({ data: { status: "pending", approvalActionId: revoke.approvalActionId } }, { status: 202 });
    return gateErrorStatus(revoke.error);
  }

  // ── /api/native/proposals/:id/<verb> — gated lifecycle transitions ──
  const verb = seg[1];
  const res = await submitProposalWrite(dataDir, tenantId, verb as "update" | "open" | "approve" | "reject" | "send", { proposalId, via: "portal" }, tenantId);
  if (res.applied) {
    // SLICE 176 — a send only reaches here after the mail lane acknowledged the
    // message, so the delivery attempt travels with the answer. The portal
    // prints what the lane said instead of inferring "sent" from the verb.
    return Response.json({
      data: {
        status: "applied",
        proposalId: res.proposal.id,
        autonomy: res.autonomy,
        ...(verb === "send"
          ? { proposalStatus: res.proposal.status, delivery: res.proposal.lastDeliveryAttempt ?? null }
          : {}),
      },
    });
  }
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
/**
 * SLICE 192b-2 — a proposal carries prices, a client's name and the firm's
 * terms. None of that may sit in an intermediary's cache, and none of it may be
 * indexed: the same two headers the invoice share lane has sent since 191.
 */
const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } as const;

/** Process-wide limiter for the public decision lane (per slug + trusted peer). */
const sharedProposalPostLimiter = createProposalPostLimiter(PROPOSAL_POST_LIMIT, PROPOSAL_POST_WINDOW_MS);

/**
 * SLICE 192b-3 (finding #9) — the decision POST had NO limiter, so an
 * unauthenticated caller could post decisions as fast as the socket allowed.
 * Same lane and same budget shape as the booking POST, keyed on the trusted
 * peer address (never `x-forwarded-for`).
 */
function decisionPostLimited(ctx: NativeProposalsPublicCtx, slug: string): boolean {
  const limiter = ctx.limiter ?? sharedProposalPostLimiter;
  return !limiter.allow(publicWriteRateKey(slug, ctx.peerAddress));
}

/**
 * SLICE 192b-3 (finding #10) — the approval store refused the write (a corrupt
 * `tenant_approvals.json`, 193's rule). Nothing was recorded and nothing on disk
 * changed. The client gets a truthful 503 with no internal path and no parse
 * error; the authenticated lanes keep the detailed message.
 */
function approvalStoreUnavailable(): Response {
  return Response.json(
    {
      error: "The approval queue is unavailable right now, so your decision was not recorded. Nothing was changed — please try again later.",
      reason: "approval-store-unavailable",
    },
    { status: 503, headers: NO_STORE },
  );
}

async function handleShareAsync(req: Request, ctx: NativeProposalsPublicCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/proposals\/share\/?/, "").split("/").filter(Boolean);
  if (seg.length !== 1 || !/^sp_[A-Za-z0-9_-]+$/.test(seg[0])) return json404("Unknown proposal share link");
  const slug = seg[0];
  const tenantId = lookupShareTenant(ctx.dataDir, slug);
  if (!tenantId) return json404("Unknown proposal share link");
  const proposal = getProposalBySlug(ctx.dataDir, tenantId, slug);
  if (!proposal) return json404("Unknown proposal share link"); // slug stale → fail-closed
  // SLICE 192b — the publish rule, enforced on the lane that serves the link,
  // from the proposals module's OWN predicate (never a copy of the status list).
  // A draft has no slug, so this is the compile-time-anchored guard rather than
  // a live path; it is here so the predicate is genuinely consumed.
  if (!isProposalPubliclyShareable(proposal.status)) {
    return Response.json(
      { error: "This proposal has not been published yet.", reason: "not-published" },
      { status: 410, headers: NO_STORE },
    );
  }
  if (req.method === "GET") {
    // SLICE 192b-2 — the client sees WHO issued this quote (finding 14). The
    // name comes from the same resolver the invoice page, PDF and delivery
    // email use, so it can never be the tenant id or an entity id.
    return Response.json(
      { data: publicShareView(proposal, Date.now(), resolveIssuerDisplayName(tenantId, ctx.dataDir)) },
      { headers: NO_STORE },
    );
  }
  if (req.method === "POST") {
    // SLICE 192b-3 — BEFORE the body is read and before anything is queued: the
    // public decision lane is rate-limited per slug + trusted peer address.
    if (decisionPostLimited(ctx, slug)) {
      const retryAfterSeconds = Math.ceil(PROPOSAL_POST_WINDOW_MS / 1000);
      return Response.json(
        {
          error: `Too many decisions for this proposal — please wait ${retryAfterSeconds} seconds and try again.`,
          retryAfterSeconds,
        },
        { status: 429, headers: { "retry-after": String(retryAfterSeconds), ...NO_STORE } },
      );
    }
    const b = parseJsonObject(await req.text());
    const decision = b.decision;
    if (decision !== "approve" && decision !== "reject") return json400("decision must be \"approve\" or \"reject\"");
    if (proposal.status !== "pending") {
      return Response.json({ error: `Proposal already decided (status ${proposal.status})` }, { status: 409 });
    }
    // SLICE 192b — the validity window is real. A quote past `expiresAt` takes
    // no decision: 409, nothing queued, nothing applied. This is the same
    // predicate the GET reports as `signable: false`, so page and server can
    // never disagree about whether the form should be there.
    if (isProposalExpired(proposal)) {
      return Response.json(
        { error: `This proposal expired on ${proposal.expiresAt}.`, reason: "expired" },
        { status: 409 },
      );
    }
    let signerName = "";
    if (typeof b.signerName === "string" && b.signerName.trim().length > 0) {
      if (b.signerName.trim().length > MAX_SIGNER_NAME) return json400(`signerName must be ≤ ${MAX_SIGNER_NAME} chars`);
      signerName = b.signerName.trim();
    }
    // Phase 2.2 e-sign: an approve decision may carry a captured signature
    // (typed initials or drawn PNG data URL). Validated here → rides the card.
    // SLICE 192b — validated AGAINST THE PROPOSAL: the hash covers the content
    // the client is agreeing to (title, currency, line items, terms, version),
    // not just the signature fields.
    let signature: ProposalSignatureInput | undefined;
    if (b.signature !== undefined) {
      const v = validateSignatureInput(b.signature, proposalSignedContent(proposal));
      if (!v.ok) return json400(v.error);
      signature = v.signature;
    }
    const res = await submitProposalWrite(ctx.dataDir, tenantId, decision, { proposalId: proposal.id, via: "client-decision", signerName: signerName || undefined, signature }, tenantId);
    if (res.applied) return Response.json({ data: { status: "applied", decision, autonomy: res.autonomy } }, { headers: NO_STORE });
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202, headers: NO_STORE });
    // SLICE 192b-3 — the store refused: 503, never a 200 that pretends the card
    // was queued, and never the internal path in the message.
    if (isApprovalStoreUnavailable(res.error)) return approvalStoreUnavailable();
    return gateErrorStatus(res.error);
  }
  return Response.json({ error: "Method not allowed" }, { status: 405, headers: NO_STORE });
}

/**
 * SLICE 192b-2 — every answer from the public proposal lane is uncacheable and
 * unindexable, including the ones built by shared helpers (`gateErrorStatus`,
 * `json400`) that do not know this lane exists. Response headers are mutable
 * for a response this process constructed; the guard keeps that honest if one
 * is ever not.
 */
function withNoStore(res: Response): Response {
  try {
    res.headers.set("cache-control", "no-store");
    res.headers.set("x-robots-tag", "noindex, nofollow");
  } catch {
    // A guarded Response — leave it exactly as the server produced it.
  }
  return res;
}

export function handleNativeProposalShare(req: Request, ctx: NativeProposalsPublicCtx): Promise<Response> {
  return handleShareAsync(req, ctx)
    .catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
      return Response.json({ error: "Internal error" }, { status: 500 });
    })
    .then(withNoStore);
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
  for (const t of ["native.proposal.created", "native.proposal.updated", "native.proposal.approved", "native.proposal.rejected", "native.esign.signed", "native.proposal.share.revoked"]) {
    registerNativeEventType(t, base);
  }
  registerNativeEventType("native.esign.signed", {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p2 = payload as Record<string, unknown>;
      if (typeof p2.proposalId !== "string" || typeof p2.signerName !== "string" || typeof p2.payloadHash !== "string") {
        return { ok: false, reason: "payload needs proposalId, signerName and payloadHash" };
      }
      return { ok: true };
    },
  });
}
export { generateProposalEntityId, validateProposalMutation, validateLineItem };