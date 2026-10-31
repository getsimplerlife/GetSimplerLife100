/**
 * native/invoice/stripe-webhook.ts — THE TENANT'S OWN Stripe webhook
 * (slice 155). This is the file that lets an invoice truthfully read "paid".
 *
 * WHAT CHANGED AND WHY. Until this slice the pay handoff wrote
 * `paymentStartedAt` and said, in the audit line, that the invoice was NOT
 * marked paid because confirming a payment needed a webhook from the workspace's
 * own Stripe account — which did not exist. The customer paid, the money landed
 * in the tenant's Stripe account, and our invoice still said "sent". That gap is
 * what this endpoint closes, and nothing else.
 *
 * THE HARD PART: WHOSE SIGNATURE? Stripe signs with a per-ENDPOINT secret that
 * lives in the tenant's dashboard, so the endpoint must know WHICH tenant a
 * request belongs to before it can verify anything — and it must not trust a
 * single byte of the body to find out. The path token
 * (`webhook-token.ts`) answers "which tenant"; the signature answers "did this
 * really come from Stripe for that tenant". Verification runs on the RAW body as
 * received (re-serialized JSON would change the bytes and never match), with a
 * timestamp tolerance so a captured payload cannot be replayed forever, and the
 * comparison itself is constant-time (the shared helper in
 * `src/lib/stripe-webhook.ts`).
 *
 * THE NEGATIVE BEHAVIOUR IS THE POINT. A validly-signed event whose amount or
 * currency does not match the invoice record does NOT mark it paid. It writes a
 * mismatch audit line and returns 200 (Stripe must not retry a mismatch — a
 * retry cannot fix a wrong amount). Money arriving in the tenant's account is
 * not the same claim as "this invoice was paid", and this file never confuses
 * the two.
 *
 * WHAT IT NEVER DOES: no outbound provider call (verification is local crypto),
 * no refund, no partial payment, no currency conversion, no touching the
 * platform's own Stripe account, and no log, audit line or response containing a
 * secret, a signature or a full provider payload — ids and amounts only.
 */
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import { verifyStripeSignature } from "../../lib/stripe-webhook";
import { publishWebhookEvent, flushTenantDeliveries } from "../webhooks/outbound";
import { loadTenantWebhookSecret } from "./stripe-connect";
import { isWebhookTokenShape, lookupTenantByWebhookToken } from "./webhook-token";
import { getInvoiceByNumber, applyInvoiceMutation, appendAudit } from "./store";
import { sanitizeProviderMessage } from "./stripe-checkout";
import {
  MAX_PROCESSED_WEBHOOK_EVENTS,
  NATIVE_INVOICE_WEBHOOK_EVENTS_KEY,
  type InvoiceRecord,
} from "./types";

/** Hard cap on the raw request body. Real Stripe events are a few KB. */
const MAX_WEBHOOK_BODY_BYTES = 256 * 1024;
/** The path prefix the platform mounts this lane on. */
const WEBHOOK_PREFIX = "/api/native/invoice/webhook/stripe/";
/** Actor recorded on every write this lane performs (never a tenant id). */
const WEBHOOK_ACTOR = "stripe-webhook";

export interface InvoiceWebhookCtx {
  dataDir: string;
}

/** What this lane did with a verified event. Also the response `outcome`. */
export type WebhookOutcome = "paid" | "mismatch" | "recorded" | "ignored" | "duplicate";

// ── Processed event ids (idempotency, bounded) ──────────────────────────────
function eventsPath(dataDir: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${NATIVE_INVOICE_WEBHOOK_EVENTS_KEY}`;
}
function loadProcessed(dataDir: string): string[] {
  try {
    const raw = readJSON(eventsPath(dataDir));
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
/** True when this exact event id has already been handled (Stripe retried). */
export function wasEventProcessed(dataDir: string, eventId: string): boolean {
  return loadProcessed(dataDir).includes(eventId);
}
/**
 * Remember an event id. Newest last; past the cap the OLDEST fall off, so the
 * file cannot grow without bound. An event old enough to have been pruned can
 * only replay against a record that already carries its payment, and the record
 * itself refuses a second effect — the id list is an optimisation, not the
 * safety net.
 */
export function rememberEvent(dataDir: string, eventId: string): void {
  const ids = loadProcessed(dataDir);
  if (ids.includes(eventId)) return;
  ids.push(eventId);
  const pruned = ids.length > MAX_PROCESSED_WEBHOOK_EVENTS ? ids.slice(ids.length - MAX_PROCESSED_WEBHOOK_EVENTS) : ids;
  writeJSON(eventsPath(dataDir), pruned);
}

// ── Small, honest formatting helpers ────────────────────────────────────────
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
/** Integer minor units → "USD 2,500.00" for an audit line (never a float sum). */
function money(cents: number, currency: string): string {
  const whole = Math.trunc(cents / 100);
  const frac = Math.abs(cents % 100).toString().padStart(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${currency} ${grouped}.${frac}`;
}

// ── The event shapes we read (nothing else) ─────────────────────────────────
interface CheckoutSessionObject {
  id?: unknown;
  client_reference_id?: unknown;
  amount_total?: unknown;
  currency?: unknown;
  payment_status?: unknown;
  metadata?: Record<string, unknown> | null;
}
interface PaymentIntentObject {
  id?: unknown;
  amount?: unknown;
  currency?: unknown;
  last_payment_error?: { message?: unknown } | null;
}
export interface StripeEventLike {
  id?: unknown;
  type?: unknown;
  data?: { object?: unknown } | null;
}

/** Append one mismatch line. Never marks anything paid, never throws. */
function recordMismatch(
  dataDir: string,
  tenantId: string,
  invoiceId: string,
  invoiceNumber: string,
  eventId: string,
  detail: string,
): WebhookOutcome {
  appendAudit(dataDir, {
    tenantId,
    actor: WEBHOOK_ACTOR,
    action: "native.invoice.payment.mismatch",
    invoiceId,
    detail: `Verified payment event ${eventId} for invoice ${invoiceNumber || "(no invoice reference)"} did NOT match the invoice record: ${detail}. The invoice is NOT marked paid and its amount is unchanged.`,
  });
  return "mismatch";
}

/**
 * Apply a VERIFIED `checkout.session.completed` /
 * `checkout.session.async_payment_succeeded` event.
 *
 * Marks the invoice paid ONLY when every one of these holds:
 *   - the event carries a session id and an invoice reference that resolves to
 *     an invoice of THIS tenant;
 *   - the session's own `payment_status` says the money was actually collected;
 *   - `amount_total` is an integer equal to the invoice's `amountDueCents`;
 *   - the currency matches the invoice's currency;
 *   - the invoice is not already paid by a DIFFERENT session.
 * Anything else records a mismatch (or a pending note) and leaves the record
 * untouched.
 */
export function applyCheckoutSessionEvent(
  dataDir: string,
  tenantId: string,
  eventId: string,
  session: CheckoutSessionObject,
): WebhookOutcome {
  const sessionId = str(session.id);
  const refFromSession = str(session.client_reference_id);
  const refFromMetadata = str(session.metadata?.invoice_number);
  const reference = refFromSession || refFromMetadata;

  if (refFromSession && refFromMetadata && refFromSession !== refFromMetadata) {
    return recordMismatch(
      dataDir,
      tenantId,
      "",
      refFromSession,
      eventId,
      `the session named two different invoices (${refFromSession} and ${refFromMetadata}), so there is no single invoice it could prove paid`,
    );
  }
  if (!reference) {
    return recordMismatch(
      dataDir,
      tenantId,
      "",
      "",
      eventId,
      `the session ${sessionId || "(no session id)"} carries no invoice reference, so it cannot be tied to any invoice of this workspace`,
    );
  }

  // In-tenant lookup by NUMBER only — a foreign invoice number simply does not
  // resolve, which is the cross-tenant guard for this lane.
  const invoice: InvoiceRecord | null = getInvoiceByNumber(dataDir, tenantId, reference);
  if (!invoice) {
    return recordMismatch(
      dataDir,
      tenantId,
      "",
      reference,
      eventId,
      `no invoice ${reference} exists in this workspace`,
    );
  }
  if (!sessionId) {
    return recordMismatch(
      dataDir,
      tenantId,
      invoice.id,
      invoice.invoiceNumber,
      eventId,
      "the event carries no checkout session id, so the payment cannot be recorded against a session",
    );
  }

  // ASYNC METHODS: a "completed" session is not necessarily a PAID session —
  // bank debits settle later and Stripe says so with payment_status "unpaid".
  const paymentStatus = str(session.payment_status).toLowerCase();
  if (paymentStatus !== "paid") {
    appendAudit(dataDir, {
      tenantId,
      actor: WEBHOOK_ACTOR,
      action: "native.invoice.payment.pending",
      invoiceId: invoice.id,
      detail: `Checkout session ${sessionId} for invoice ${invoice.invoiceNumber} is complete but its payment status is "${paymentStatus || "unknown"}", not "paid" — the invoice stays unpaid until the provider confirms the money.`,
    });
    return "recorded";
  }

  const amount = session.amount_total;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
    return recordMismatch(
      dataDir,
      tenantId,
      invoice.id,
      invoice.invoiceNumber,
      eventId,
      "the session reported no usable integer amount, so the invoice amount cannot be matched",
    );
  }
  const currency = str(session.currency).toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    return recordMismatch(
      dataDir,
      tenantId,
      invoice.id,
      invoice.invoiceNumber,
      eventId,
      "the session reported no usable currency, so the invoice currency cannot be matched",
    );
  }
  const invoiceCurrency = String(invoice.currency || "").toUpperCase();
  if (currency !== invoiceCurrency.toLowerCase()) {
    return recordMismatch(
      dataDir,
      tenantId,
      invoice.id,
      invoice.invoiceNumber,
      eventId,
      `the payment was in ${currency.toUpperCase()} but the invoice is in ${invoiceCurrency || "(none)"} — ${money(amount, currency.toUpperCase())} against ${money(invoice.amountDueCents, invoiceCurrency)}`,
    );
  }
  if (amount !== invoice.amountDueCents) {
    // THE TEST THAT MATTERS: a validly-signed event for the wrong amount is
    // NOT proof that this invoice was paid.
    return recordMismatch(
      dataDir,
      tenantId,
      invoice.id,
      invoice.invoiceNumber,
      eventId,
      `the payment was for ${money(amount, currency.toUpperCase())} but the invoice is for ${money(invoice.amountDueCents, invoiceCurrency)}`,
    );
  }
  if (invoice.payment) {
    if (invoice.payment.sessionId === sessionId) {
      // Same session, same event class: Stripe retried. Nothing to do.
      return "duplicate";
    }
    return recordMismatch(
      dataDir,
      tenantId,
      invoice.id,
      invoice.invoiceNumber,
      eventId,
      `the invoice was already paid by session ${invoice.payment.sessionId}, so session ${sessionId} is not applied a second time`,
    );
  }

  const now = new Date().toISOString();
  applyInvoiceMutation(
    dataDir,
    tenantId,
    invoice.id,
    {
      payment: {
        paidAt: now,
        amountCents: amount,
        currency: invoiceCurrency,
        sessionId,
        eventId,
      },
      lastCheckoutSessionId: sessionId,
    },
    WEBHOOK_ACTOR,
  );
  appendAudit(dataDir, {
    tenantId,
    actor: WEBHOOK_ACTOR,
    action: "native.invoice.payment.confirmed",
    invoiceId: invoice.id,
    detail: `Payment received for invoice ${invoice.invoiceNumber}: ${money(amount, invoiceCurrency)} — confirmed by this workspace's own payment webhook (session ${sessionId}, event ${eventId}). The amount and currency matched the invoice record exactly.`,
  });
  publishPaymentConfirmed(dataDir, tenantId, invoice, amount, invoiceCurrency, sessionId);
  return "paid";
}

/** `checkout.session.expired` — honest, and never a paid state. */
export function applyCheckoutSessionExpired(
  dataDir: string,
  tenantId: string,
  eventId: string,
  session: CheckoutSessionObject,
): WebhookOutcome {
  const sessionId = str(session.id) || "(no session id)";
  const reference = str(session.client_reference_id) || str(session.metadata?.invoice_number);
  const invoice = reference ? getInvoiceByNumber(dataDir, tenantId, reference) : null;
  const label = invoice ? invoice.invoiceNumber : reference || "(no invoice reference)";
  appendAudit(dataDir, {
    tenantId,
    actor: WEBHOOK_ACTOR,
    action: "native.invoice.payment.expired",
    invoiceId: invoice?.id ?? "",
    detail: `Checkout session ${sessionId} for invoice ${label} expired without payment (event ${eventId}) — the invoice is unchanged and does not read paid.`,
  });
  return "recorded";
}

/**
 * `payment_intent.payment_failed` — honest, and never a paid state. A payment
 * intent carries no invoice reference of ours, so this line deliberately does
 * NOT claim which invoice it belonged to; it records the failure and the reason
 * the provider gave (sanitized, length-capped, never a credential).
 */
export function applyPaymentIntentFailed(
  dataDir: string,
  tenantId: string,
  eventId: string,
  intent: PaymentIntentObject,
): WebhookOutcome {
  const intentId = str(intent.id) || "(no intent id)";
  const amount = typeof intent.amount === "number" && Number.isInteger(intent.amount) ? intent.amount : null;
  const currency = str(intent.currency).toUpperCase() || "(unknown)";
  const reason = sanitizeProviderMessage(str(intent.last_payment_error?.message)) || "the provider gave no reason";
  appendAudit(dataDir, {
    tenantId,
    actor: WEBHOOK_ACTOR,
    action: "native.invoice.payment.failed",
    invoiceId: "",
    detail: `A payment attempt on this workspace's Stripe account failed (intent ${intentId}, ${amount === null ? "amount unknown" : money(amount, currency)}, event ${eventId}): ${reason}. No invoice was marked paid by this event.`,
  });
  return "recorded";
}

/** Best-effort typed event after the durable record (Phase 1.1 discipline). */
function publishPaymentConfirmed(
  dataDir: string,
  tenantId: string,
  invoice: InvoiceRecord,
  amountCents: number,
  currency: string,
  sessionId: string,
): void {
  try {
    const n = publishWebhookEvent(
      dataDir,
      tenantId,
      "native.invoice.payment.confirmed",
      {
        eventId: `evt_${invoice.id}`,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        currency,
        amountCents,
        sessionId,
      },
      "native-invoices",
    );
    if (n > 0) void flushTenantDeliveries(dataDir, tenantId).catch(() => undefined);
  } catch {
    /* event publish is best-effort after the durable record */
  }
}

// ── The endpoint ────────────────────────────────────────────────────────────
const NO_STORE = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" } as const;
function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/**
 * POST /api/native/invoice/webhook/stripe/<token> — UNAUTHENTICATED (Stripe has
 * no session here). Order is deliberate and never rearranged:
 *
 *   1. method + token SHAPE (cheap, reveals nothing) → 404
 *   2. token → tenant (constant-time digest compare)  → 404
 *   3. tenant's stored endpoint secret                → 400 when absent
 *   4. RAW body read once, size-capped
 *   5. signature verification (constant time, 5-minute tolerance) → 400/401
 *   6. only NOW is the body parsed and read
 *   7. idempotency by event id, then the event itself
 *
 * Every failure writes nothing, audits nothing and calls nothing.
 */
export async function handleTenantInvoiceStripeWebhook(
  req: Request,
  ctx: InvoiceWebhookCtx,
): Promise<Response> {
  try {
    return await handleVerified(req, ctx);
  } catch {
    // Never leak an internal message to an unauthenticated caller.
    return jsonResponse(500, { error: "Internal error" });
  }
}

async function handleVerified(req: Request, ctx: InvoiceWebhookCtx): Promise<Response> {
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const url = new URL(req.url);
  if (!url.pathname.startsWith(WEBHOOK_PREFIX)) return jsonResponse(404, { error: "Not found" });
  const token = url.pathname.slice(WEBHOOK_PREFIX.length);
  // A token is ONE path segment. Anything longer (a sub-path, a query trick) is
  // not an address we ever issued.
  if (token.includes("/") || !isWebhookTokenShape(token)) return jsonResponse(404, { error: "Not found" });

  const tenantId = lookupTenantByWebhookToken(ctx.dataDir, token);
  // Unknown address: a plain 404 that says nothing about whether it once
  // existed, and writes nothing anywhere.
  if (!tenantId) return jsonResponse(404, { error: "Not found" });

  const secret = loadTenantWebhookSecret(ctx.dataDir, tenantId);
  if (!secret) {
    return jsonResponse(400, { error: "This workspace's payment webhook is not configured." });
  }

  const raw = await req.text();
  if (raw.length > MAX_WEBHOOK_BODY_BYTES) return jsonResponse(413, { error: "Payload too large" });

  const check = verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret);
  if (!check.ok) {
    const reason = check.error || "";
    if (/^Missing|^Invalid Stripe signature header|^Invalid Stripe signature timestamp/.test(reason)) {
      return jsonResponse(400, { error: "Invalid signature header" });
    }
    // A stale-but-otherwise-valid signature and a wrong signature are the same
    // answer to the caller: not authenticated.
    return jsonResponse(401, { error: "Invalid signature" });
  }

  let event: StripeEventLike;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    event = parsed as StripeEventLike;
  } catch {
    return jsonResponse(400, { error: "Invalid payload" });
  }

  const eventId = str(event.id);
  if (!/^evt_[A-Za-z0-9_]+$/.test(eventId)) return jsonResponse(400, { error: "Invalid payload" });
  const type = str(event.type);
  const object = (event.data?.object ?? null) as Record<string, unknown> | null;

  if (wasEventProcessed(ctx.dataDir, eventId)) {
    return jsonResponse(200, { received: true, outcome: "duplicate" });
  }

  let outcome: WebhookOutcome;
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      outcome = object
        ? applyCheckoutSessionEvent(ctx.dataDir, tenantId, eventId, object as CheckoutSessionObject)
        : "ignored";
      break;
    case "checkout.session.expired":
      outcome = object
        ? applyCheckoutSessionExpired(ctx.dataDir, tenantId, eventId, object as CheckoutSessionObject)
        : "ignored";
      break;
    case "payment_intent.payment_failed":
      outcome = object
        ? applyPaymentIntentFailed(ctx.dataDir, tenantId, eventId, object as PaymentIntentObject)
        : "ignored";
      break;
    default:
      // Unknown type: acknowledged with NO effect. Stripe must not retry
      // forever for an event this build does not act on.
      outcome = "ignored";
      break;
  }

  // Recorded only AFTER the effect landed, so a throwing apply is retried by
  // Stripe instead of being remembered as handled.
  rememberEvent(ctx.dataDir, eventId);
  return jsonResponse(200, { received: true, outcome });
}
