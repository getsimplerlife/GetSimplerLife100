/**
 * native/invoice/router.ts — HTTP surface for Phase 2.5 invoices.
 *
 * AUTHED (tenant): /api/native/invoice* — list/create/view/generate/send/
 * delete + writes/apply/reject + audit. Reads are tenant-scoped
 * (ctx.userEmail); every mutation is a GATED write (gate.ts); 404 on any
 * foreign/unknown invoice id (fail-closed, no IDOR).
 *
 * SHARE-LINK LIFECYCLE (slice 152): POST /api/native/invoice/:id/share/revoke
 * and POST /api/native/invoice/:id/share/rotate kill, or kill-and-reissue, the
 * public slug. A sent invoice's link could previously never be taken back (the
 * only unregister path was delete, and `sent` is terminal); now the tenant can
 * retire it at will. Both are gated writes and neither changes the status.
 * Revoking OUR page does not cancel a Stripe Checkout Session already opened on
 * the tenant's own account — every response says that in so many words.
 *
 * PUBLIC (customer): /api/native/invoice/share/:slug[/pdf] — the read-only
 * invoice the customer received by email. Same signed-slug pattern as
 * proposals (2.1): the global index maps slug → tenantId ONLY, the slug is
 * unguessable, and the lane is READ-ONLY. Fail-closed rules:
 *   - unknown / malformed / stale slug → 404,
 *   - an invoice that is NOT "sent" → 404 (a draft or a failed delivery is
 *     never public),
 *   - the view carries ONLY that one invoice (number, amounts, line items,
 *     due date, issuer, bill-to) — no ids, no listing, no other records.
 *
 * PAYMENT (slice 134): `POST /api/native/invoice/share/:slug/pay` creates a
 * Stripe Checkout Session on the ISSUING TENANT'S OWN Stripe account (their
 * key, their account — we never hold or move the money) and returns the hosted
 * checkout URL. It writes `paymentStartedAt` and the session id — never "paid":
 * opening a checkout page is not money.
 * A tenant with no Stripe connection gets an honest 409 and NO outbound call.
 *
 * PAYMENT CONFIRMATION (slice 155): `POST /api/native/invoice/webhook/stripe/
 * <token>` is the UNAUTHENTICATED lane the issuing tenant's own Stripe account
 * posts to (see `stripe-webhook.ts`). It is the only writer of `payment`, and it
 * writes it only for a verified event whose amount and currency match the
 * invoice exactly. A mismatch is recorded and the invoice stays unpaid.
 *
 * Route parsing uses EXPLICIT SEGMENTS, not a two-capture regex — avoids the
 * Phase 1.4 rowMatch/idMatch shadowing bug class entirely (2.1–2.4 discipline).
 */
import { registerNativeEventType } from "../webhooks/registry";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { randomBytes } from "node:crypto";
import {
  listInvoices,
  getInvoice,
  getInvoiceBySlug,
  lookupInvoiceShareTenant,
  listPendingWrites,
  getPendingWriteById,
  listAudit,
  applyInvoiceMutation,
  appendAudit,
} from "./store";
import { submitInvoiceWrite, executePendingInvoiceWrite, noteOwnerDecision, createInvoiceMutationFromInput, SHARE_LINK_PAY_NOTICE } from "./gate";
import { resolveIssuerDisplayName } from "./issuer";
import { isInvoiceId } from "./validate";
import { publicOrigin, invoiceShareUrl } from "./delivery";
import {
  connectTenantStripe,
  disconnectTenantStripe,
  getTenantStripeStatus,
  setTenantWebhookSecret,
} from "./stripe-connect";
import { createTenantCheckoutSession } from "./stripe-checkout";
import { getOrCreateTenantWebhookToken, rotateTenantWebhookToken, invoiceWebhookPath } from "./webhook-token";
import { getDealRoom } from "../dealroom/store";
import { readDocumentBytes, getDoc } from "../documents/store";
import type { InvoiceRecord } from "./types";

export interface NativeInvoicesCtx {
  dataDir: string;
  userEmail: string; // tenant id
}
export interface NativeInvoicePublicCtx {
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
  const nf = /not found|no pending write|already applied|already decided|unknown linkedDealRoomId|linked deal room has no/.test(error);
  const bad = /required|must|cap reached|cannot|invalid|at least|failed|unknown/.test(error);
  if (nf) return json404(error);
  if (bad) return json400(error);
  return Response.json({ error }, { status: 500 });
}

/** Tenant-facing summary — the full record (internal surface). */
function summary(i: {
  id: string;
  invoiceNumber: string;
  linkedDealRoomId: string;
  currency: string;
  amountDueCents: number;
  status: string;
  docId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
}) {
  return i;
}

/**
 * Customer-facing view of a SENT invoice — only what that invoice says.
 * No record ids, no docId, no deal-room id, no audit, no other records.
 * `issuerName` is a human DISPLAY NAME resolved by issuer.ts — never the
 * tenant id (the workspace account identifier) and never an entity id.
 *
 * `canPay` is TRUE only when the ISSUING TENANT has connected its own Stripe
 * account; the page then renders a real "Pay {amount}" button. It carries no
 * hint, no mode and no key material — the customer learns nothing about the
 * tenant's credentials, only that this invoice can be paid online.
 * `paymentStartedAt` is the truthful "a payment was started" stamp — never a
 * "paid" claim (confirming a payment would need a webhook, which is out of
 * scope).
 */
export function publicInvoiceView(
  inv: InvoiceRecord,
  billToName: string,
  issuerName: string,
  canPay = false,
): Record<string, unknown> {
  return {
    invoiceNumber: inv.invoiceNumber,
    issuerName,
    billToName,
    currency: inv.currency,
    lineItems: inv.lineItems.map((li) => ({
      description: li.description,
      qty: li.qty,
      unitPriceCents: li.unitPriceCents,
      amountCents: Math.round(li.qty * li.unitPriceCents),
    })),
    amountDueCents: inv.amountDueCents,
    issuedAt: inv.createdAt,
    dueDate: inv.dueDate,
    status: inv.status,
    hasPdf: inv.docId !== null,
    pdfPath: `/api/native/invoice/share/${inv.shareSlug}/pdf`,
    canPay,
    paymentStartedAt: inv.paymentStartedAt ?? null,
    /**
     * SLICE 155 — the payment truth, and the only place it is stated.
     * `paid` is true ONLY after a verified webhook from the issuing tenant's own
     * Stripe account whose amount and currency matched this record exactly.
     * `paymentStartedAt` (someone opened a checkout page) is NOT evidence of
     * money and never flips this flag.
     */
    paid: !!inv.payment,
    paidAt: inv.payment?.paidAt ?? null,
    amountPaidCents: inv.payment?.amountCents ?? null,
  };
}

async function handleAuthedAsync(req: Request, ctx: NativeInvoicesCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/invoice\/?/, "").split("/").filter(Boolean);
  const tenantId = ctx.userEmail;
  const dataDir = ctx.dataDir;

  // ── /api/native/invoice (index) — list / create ──
  if (seg.length === 0) {
    if (req.method === "GET") {
      // Optional ?dealRoomId= filter for the deal-room panel.
      const filter = url.searchParams.get("dealRoomId");
      const rows = listInvoices(dataDir, tenantId)
        .filter((i) => !filter || i.linkedDealRoomId === filter)
        .map((i) => summary(i));
      return Response.json({ data: rows });
    }
    if (req.method === "POST") {
      const b = parseJsonObject(await req.text());
      // Fail-closed: a client-supplied id on create is by definition forged —
      // reject the RAW body BEFORE any normalization (checklists 2.3 / deal room 2.4).
      if (b.id !== undefined) return json400("invalid id on create (ids are server-assigned)");
      if (b.status !== undefined) return json400("status must not be set on create (invoices always start as draft)");
      const data = createInvoiceMutationFromInput(b);
      const res = await submitInvoiceWrite(dataDir, tenantId, "create", { data, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", invoiceId: res.invoice.id, autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/invoice/writes — pending writes + apply/reject decisions ──
  if (seg[0] === "writes") {
    if (seg.length === 1 && req.method === "GET") {
      return Response.json({
        data: listPendingWrites(dataDir, tenantId).map((w) => ({
          id: w.id,
          op: w.op,
          invoiceId: w.invoiceId,
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
      if (!ptw || ptw.tenantId !== tenantId) return json404("no pending write for this invoice action");
      if (seg[2] === "reject") {
        await noteOwnerDecision(dataDir, tenantId, ptw.approvalActionId, "rejected", tenantId);
        return Response.json({ data: { status: "rejected", id: ptw.id } });
      }
      const res = await executePendingInvoiceWrite(dataDir, tenantId, ptw.approvalActionId, tenantId);
      if (!res.ok) return gateErrorStatus(res.reason);
      // A share-link write carries the same honest payment caveat as the direct
      // response: killing our page never cancelled a Checkout Session the
      // customer already opened (see SHARE_LINK_PAY_NOTICE).
      const shareOp = res.op === "revokeShare" || res.op === "rotateShare";
      return Response.json({
        data: {
          status: res.alreadyApplied ? "alreadyApplied" : "applied",
          invoiceId: res.record.id,
          invoiceStatus: res.record.status,
          alreadyApplied: !!res.alreadyApplied,
          shareUrl: res.record.shareSlug ? invoiceShareUrl(res.record.shareSlug) : null,
          ...(shareOp ? { publicLinkDead: res.op === "revokeShare", checkoutSessionMayStillBePayable: true, notice: SHARE_LINK_PAY_NOTICE } : {}),
        },
      });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/invoice/audit ──
  if (seg[0] === "audit") {
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    return Response.json({ data: listAudit(dataDir, tenantId) });
  }

  // ── /api/native/invoice/stripe — the TENANT'S OWN Stripe connection ──
  // GET    → { connected, hint (last 4), keyMode, addedAt, hasWebhookSecret,
  //            webhookUrl } — never the key, never the signing secret.
  // POST   → { secretKey, webhookSecret? } validated BEFORE anything is
  //          stored/audited (webhookSecret alone also works on PUT).
  // PUT    → same as POST (an endpoint secret can be added later on its own).
  // DELETE → revoke (subsequent pay attempts fail closed immediately).
  // Credential management, not a business-data write: same class as the
  // import/OAuth connect lanes, so it does not ride the Approval Queue — but
  // every change is audited immutably with the MASK only.
  //
  // SLICE 155: `webhookUrl` is the address the tenant pastes into THEIR Stripe
  // dashboard for the endpoint that confirms payments. It is stable, and it is
  // minted on first read so the tenant can create the endpoint before or after
  // connecting their key. The signing secret itself is write-only.
  if (seg[0] === "stripe" && seg.length === 1) {
    if (req.method === "GET") {
      const status = getTenantStripeStatus(dataDir, tenantId);
      const token = getOrCreateTenantWebhookToken(dataDir, tenantId);
      return Response.json({
        data: { ...status, webhookUrl: `${publicOrigin()}${invoiceWebhookPath(token)}` },
      });
    }
    if (req.method === "POST" || req.method === "PUT") {
      const raw = await req.text();
      const b = parseJsonObject(raw);
      const hasKey = b.secretKey !== undefined;
      const hasWebhook = b.webhookSecret !== undefined;
      if (!hasKey && !hasWebhook) return json400("Paste your Stripe secret key.");
      // Both secrets are validated BEFORE the first write, so a bad signing
      // secret can never leave a half-connected account behind.
      const res = hasKey
        ? connectTenantStripe(dataDir, tenantId, tenantId, b.secretKey, hasWebhook ? b.webhookSecret : undefined)
        : setTenantWebhookSecret(dataDir, tenantId, tenantId, b.webhookSecret);
      if (!res.ok) return json400(res.error);
      const token = getOrCreateTenantWebhookToken(dataDir, tenantId);
      // The response carries the masked status only — never a submitted secret.
      return Response.json({ data: { ...res.status, webhookUrl: `${publicOrigin()}${invoiceWebhookPath(token)}` } });
    }
    if (req.method === "DELETE") {
      const removed = disconnectTenantStripe(dataDir, tenantId, tenantId);
      return Response.json({ data: { ...getTenantStripeStatus(dataDir, tenantId), removed } });
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/invoice/stripe/webhook/rotate — replace the webhook address ──
  // Explicit action only: the previous URL stops resolving the moment this
  // returns, so the tenant must paste the new one into their dashboard.
  if (seg[0] === "stripe" && seg[1] === "webhook" && seg[2] === "rotate" && seg.length === 3) {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const res = rotateTenantWebhookToken(dataDir, tenantId, tenantId);
    if (!res.ok) return json400(res.error);
    return Response.json({
      data: {
        webhookUrl: `${publicOrigin()}${invoiceWebhookPath(res.token)}`,
        previousUrlDead: true,
        hasWebhookSecret: getTenantStripeStatus(dataDir, tenantId).hasWebhookSecret,
      },
    });
  }

  // ── /api/native/invoice/:id[/verb] ──
  if (!isInvoiceId(seg[0])) return json404("Unknown native invoice endpoint");
  const invoiceId = seg[0];
  const invoice = getInvoice(dataDir, tenantId, invoiceId);
  if (!invoice) return json404("Invoice not found"); // foreign/stranger → 404 (no IDOR)

  if (seg.length === 1) {
    if (req.method === "GET") return Response.json({ data: summary(invoice) });
    if (req.method === "DELETE") {
      const res = await submitInvoiceWrite(dataDir, tenantId, "delete", { invoiceId, via: "portal" }, tenantId);
      if (res.applied) return Response.json({ data: { status: "applied", autonomy: res.autonomy } });
      if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
      return gateErrorStatus(res.error);
    }
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  // ── /api/native/invoice/:id/<verb> — lifecycle transitions ──
  const verb = seg[1];
  if (verb === "generate" || verb === "send") {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    // `send` may carry an explicit recipient (validated BEFORE the gate).
    // An empty body is fine — the record's own customerEmail is then used.
    let data: { customerEmail?: string } | undefined;
    if (verb === "send") {
      const raw = await req.text().catch(() => "");
      if (raw.trim().length > 0) {
        const b = parseJsonObject(raw);
        if (b.customerEmail !== undefined && typeof b.customerEmail !== "string") {
          return json400("customerEmail must be a valid email address");
        }
        data = { customerEmail: b.customerEmail as string | undefined };
      }
    }
    const res = await submitInvoiceWrite(dataDir, tenantId, verb, { invoiceId, data, via: "portal" }, tenantId);
    if (res.applied) {
      return Response.json({
        data: {
          status: "applied",
          invoiceId: res.invoice.id,
          invoiceStatus: res.invoice.status,
          delivered: res.invoice.status === "sent",
          lastAttempt: res.invoice.lastAttempt,
          autonomy: res.autonomy,
        },
      });
    }
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error);
  }
  // ── /api/native/invoice/:id/share/(revoke|rotate) — slice 152 ──
  // The public slug is a BEARER credential: whoever holds it can read the
  // invoice and reach the pay button. Revoking kills it for good; rotating
  // kills it and issues a fresh one. Both are GATED writes (approvalGate, same
  // as every other invoice write), both 404 on a foreign/unknown invoice, and
  // neither changes the invoice status — `sent` stays terminal.
  //
  // HONESTY (non-negotiable): this kills OUR page. It does NOT cancel a Stripe
  // Checkout Session the customer already opened — that lives on the tenant's
  // own Stripe account and its id is not on the invoice record, so the money
  // side is not closed by this call. Every response says so explicitly rather
  // than implying "revoked" means "unpayable".
  if (verb === "share" && (seg[2] === "revoke" || seg[2] === "rotate")) {
    if (seg.length !== 3) return json404("Unknown native invoice endpoint");
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    const shareOp = seg[2] === "revoke" ? ("revokeShare" as const) : ("rotateShare" as const);
    const res = await submitInvoiceWrite(dataDir, tenantId, shareOp, { invoiceId, via: "portal" }, tenantId);
    if (res.applied) {
      const shareUrl = res.invoice.shareSlug ? invoiceShareUrl(res.invoice.shareSlug) : null;
      return Response.json({
        data: {
          status: "applied",
          invoiceId: res.invoice.id,
          invoiceStatus: res.invoice.status,
          autonomy: res.autonomy,
          ...(shareOp === "revokeShare"
            ? { shareRevoked: true, publicLinkDead: true, shareUrl: null }
            : { shareUrl, previousLinkDead: true }),
          // Stated plainly, never implied away (see SHARE_LINK_PAY_NOTICE).
          checkoutSessionMayStillBePayable: true,
          notice: SHARE_LINK_PAY_NOTICE,
        },
      });
    }
    if (res.pending) return Response.json({ data: { status: "pending", approvalActionId: res.approvalActionId } }, { status: 202 });
    return gateErrorStatus(res.error);
  }
  return json404("Unknown native invoice endpoint");
}

export function handleNativeInvoicesAuthed(req: Request, ctx: NativeInvoicesCtx): Promise<Response> {
  return handleAuthedAsync(req, ctx).catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/Invalid JSON|Body must/.test(msg)) return json400(msg);
    return Response.json({ error: "Internal error" }, { status: 500 });
  });
}

// ── PUBLIC share (customer read-only view + PDF download + pay handoff) ─────
const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } as const;

/**
 * Fixed-window rate limit for the public pay lane (slug → bucket). A customer
 * legitimately needs a handful of attempts; an abuser must not be able to spin
 * up thousands of Checkout Sessions on the tenant's own Stripe account.
 */
const PAY_RATE_LIMIT = 10;
const PAY_RATE_WINDOW_MS = 10 * 60_000;
const payBuckets = new Map<string, { count: number; resetAt: number }>();
function payRateLimited(slug: string): boolean {
  const now = Date.now();
  const b = payBuckets.get(slug);
  if (!b || b.resetAt <= now) {
    payBuckets.set(slug, { count: 1, resetAt: now + PAY_RATE_WINDOW_MS });
    return false;
  }
  b.count += 1;
  return b.count > PAY_RATE_LIMIT;
}

async function handleShareAsync(req: Request, ctx: NativeInvoicePublicCtx): Promise<Response> {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/native\/invoice\/share\/?/, "").split("/").filter(Boolean);
  if (seg.length === 0 || seg.length > 2) return json404("Unknown invoice share link");
  const slug = seg[0];
  if (!/^si_[A-Za-z0-9_-]+$/.test(slug)) return json404("Unknown invoice share link");
  const tenantId = lookupInvoiceShareTenant(ctx.dataDir, slug);
  if (!tenantId) return json404("Unknown invoice share link"); // unknown / retired slug
  const invoice = getInvoiceBySlug(ctx.dataDir, tenantId, slug);
  if (!invoice) return json404("Unknown invoice share link"); // stale index entry
  // FAIL-CLOSED: only a genuinely SENT invoice is public. A draft, an in-flight
  // dispatch (queued) or a failed delivery never resolves on the public lane.
  if (invoice.status !== "sent") return json404("Unknown invoice share link");

  // ── PAY (the only write on the public lane) ──
  // Creates a Checkout Session on the ISSUING TENANT'S OWN Stripe account.
  // The amount/currency come from the invoice RECORD — this handler reads no
  // request body at all, so a payer can never influence what is charged.
  if (seg.length === 2 && seg[1] === "pay") {
    if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (payRateLimited(slug)) {
      return Response.json(
        { error: "Too many payment attempts on this invoice. Please wait a few minutes and try again." },
        { status: 429, headers: NO_STORE },
      );
    }
    const base = `${publicOrigin()}/invoices/share/${slug}`;
    const res = await createTenantCheckoutSession({
      dataDir: ctx.dataDir,
      tenantId,
      invoice,
      successUrl: `${base}?checkout=return`,
      cancelUrl: `${base}?checkout=cancelled`,
    });
    if (!res.ok) {
      // not_connected / invalid_amount → 409 (nothing to pay online, honestly);
      // provider_error → 502 (the provider failed; no payment was started).
      const status = res.reason === "provider_error" ? 502 : 409;
      return Response.json({ error: res.message }, { status, headers: NO_STORE });
    }
    // TRUTHFUL STATE: a payment was STARTED. Never "paid" — the confirmation
    // arrives (if it arrives) through the workspace's own payment webhook, and
    // only when its amount and currency match this invoice exactly.
    const now = new Date().toISOString();
    const updated = applyInvoiceMutation(
      ctx.dataDir,
      tenantId,
      invoice.id,
      { paymentStartedAt: now, lastCheckoutSessionId: res.sessionId },
      "customer",
    );
    appendAudit(ctx.dataDir, {
      tenantId,
      actor: "customer",
      action: "native.invoice.payment.started",
      invoiceId: invoice.id,
      detail: `Customer started a payment for invoice ${invoice.invoiceNumber} (${invoice.currency} ${(invoice.amountDueCents / 100).toFixed(2)}) on the workspace's own Stripe account — session ${res.sessionId}. The invoice is NOT marked paid yet: it reads paid only when the workspace's own payment webhook confirms a payment of exactly this amount and currency.`,
    });
    publishPublicEvent(ctx.dataDir, tenantId, "native.invoice.payment.started", {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      currency: invoice.currency,
      amountDueCents: invoice.amountDueCents,
      sessionId: res.sessionId,
    });
    return Response.json(
      { data: { checkoutUrl: res.url, paymentStartedAt: updated?.paymentStartedAt ?? now } },
      { headers: NO_STORE },
    );
  }

  if (seg.length === 2) {
    if (seg[1] !== "pdf") return json404("Unknown invoice share link");
    if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
    if (!invoice.docId) return json404("No PDF on file for this invoice");
    const doc = getDoc(ctx.dataDir, tenantId, invoice.docId);
    if (!doc) return json404("PDF record missing");
    const bytes = readDocumentBytes(ctx.dataDir, tenantId, invoice.docId);
    if (!bytes) return json404("PDF bytes missing");
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${invoice.invoiceNumber}.pdf"`,
        "cache-control": "no-store",
        "x-robots-tag": "noindex, nofollow",
      },
    });
  }
  if (req.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const dealRoom = getDealRoom(ctx.dataDir, tenantId, invoice.linkedDealRoomId);
  // The customer learns ONLY whether this invoice can be paid online — never
  // the tenant's connection hint, mode or key material.
  const canPay = getTenantStripeStatus(ctx.dataDir, tenantId).connected;
  return Response.json(
    {
      data: publicInvoiceView(
        invoice,
        dealRoom?.customerName || "Customer",
        resolveIssuerDisplayName(tenantId, ctx.dataDir),
        canPay,
      ),
    },
    { headers: NO_STORE },
  );
}

/** Public lane entry point — never leaks internals, never throws past the 404. */
export function handleNativeInvoiceShare(req: Request, ctx: NativeInvoicePublicCtx): Promise<Response> {
  return handleShareAsync(req, ctx).catch(() => json404("Unknown invoice share link"));
}

/**
 * Typed event emitted AFTER the durable record (Phase 1.1 outbound, 2.1–2.4
 * discipline). Best-effort: a webhook that cannot be queued never undoes a
 * payment handoff that already happened at the provider.
 */
function publishPublicEvent(
  dataDir: string,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): void {
  try {
    const n = publishWebhookEvent(
      dataDir,
      tenantId,
      eventType,
      { ...payload, eventId: `evt_${randomBytes(8).toString("hex")}` },
      "native-invoices",
    );
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch {
    /* event publish is best-effort after the durable record */
  }
}

// ── Built-in typed events (Phase 1.1 registry pattern, 2.1–2.4) ─────────────
export function registerBuiltinNativeInvoiceEventTypes(): void {
  const base = {
    validate: (payload: unknown): { ok: true } | { ok: false; reason: string } => {
      if (!payload || typeof payload !== "object") return { ok: false, reason: "payload must be an object" };
      const p = payload as Record<string, unknown>;
      if (typeof p.invoiceId !== "string" || typeof p.eventId !== "string") {
        return { ok: false, reason: "payload needs invoiceId and eventId" };
      }
      return { ok: true };
    },
  };
  for (const t of [
    "native.invoice.created",
    "native.invoice.generated",
    "native.invoice.queued",
    "native.invoice.sent",
    "native.invoice.failed",
    "native.invoice.deleted",
    "native.invoice.payment.started",
    "native.invoice.payment.confirmed",
    "native.invoice.share.revoked",
    "native.invoice.share.rotated",
  ]) {
    registerNativeEventType(t, base);
  }
}