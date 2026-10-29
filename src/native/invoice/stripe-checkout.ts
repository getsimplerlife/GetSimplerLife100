/**
 * native/invoice/stripe-checkout.ts — create a Stripe Checkout Session ON THE
 * TENANT'S OWN STRIPE ACCOUNT (slice 134).
 *
 * Money rule (owner 2026-10-29): the session is created with the ISSUING
 * TENANT's key, on the ISSUING TENANT's account. Funds settle to them. The
 * platform never holds, collects, routes or remits a tenant's customer money,
 * and the platform's own Stripe account is not involved anywhere in this file.
 *
 * Fail-closed rules, each exercised in src/test/native-invoice-pay.test.ts:
 *   - NO connection for that tenant → return `not_connected` WITHOUT any
 *     outbound request at all (no fetch, no DNS, nothing). The public page then
 *     shows no pay button and says payment is arranged with the issuer.
 *   - the AMOUNT and CURRENCY come from the invoice RECORD, server-side only.
 *     A request body can never influence either — the public pay endpoint reads
 *     no body fields at all.
 *   - a provider error is reported verbatim-but-sanitized: honest message, no
 *     fake success, and the tenant's key is scrubbed out of the text before it
 *     can reach a response, a log or an audit line.
 *   - a "success" that does not carry a Stripe-hosted checkout URL is treated as
 *     a provider error (no redirect to an unverified origin).
 *
 * OUT OF SCOPE (deliberately not built): webhooks from the tenant's account,
 * marking an invoice paid, refunds, partial payments, subscription billing for
 * tenants, and any currency other than the invoice's own.
 */
import { loadTenantStripeSecret } from "./stripe-connect";
import type { InvoiceRecord } from "./types";

/** Stripe's Checkout Session create endpoint (the TENANT's account). */
const STRIPE_CHECKOUT_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
/** Hard outbound timeout — a hung provider must not hang a customer page. */
const PROVIDER_TIMEOUT_MS = 15_000;

export interface TenantCheckoutInput {
  dataDir: string;
  tenantId: string;
  invoice: InvoiceRecord;
  /** Where Stripe sends the payer back on completion (public invoice page). */
  successUrl: string;
  /** Where Stripe sends the payer back when they abandon the session. */
  cancelUrl: string;
}

export type TenantCheckoutResult =
  | { ok: true; url: string; sessionId: string }
  | { ok: false; reason: "not_connected" | "invalid_amount" | "provider_error"; message: string };

/**
 * Remove any credential material from a provider message before it is stored,
 * returned or logged. Stripe error bodies do not normally echo keys, but this
 * lane never relies on that.
 */
export function sanitizeProviderMessage(raw: unknown, secret?: string): string {
  let msg = typeof raw === "string" ? raw : "";
  if (secret && secret.length >= 8) msg = msg.split(secret).join("[redacted]");
  // Belt and braces: scrub anything shaped like a Stripe secret key.
  msg = msg.replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]+/g, "[redacted]");
  msg = msg.replace(/\s+/g, " ").trim();
  if (msg.length > 300) msg = `${msg.slice(0, 300)}…`;
  return msg;
}

/** True only for a genuine Stripe-hosted https URL (no open redirect). */
function isStripeHostedUrl(url: unknown): url is string {
  if (typeof url !== "string" || !url.startsWith("https://")) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "stripe.com" || host.endsWith(".stripe.com");
  } catch {
    return false;
  }
}

/**
 * Create the Checkout Session. Never throws: every outcome is explicit so the
 * caller can show the truth to the customer.
 */
export async function createTenantCheckoutSession(input: TenantCheckoutInput): Promise<TenantCheckoutResult> {
  const { dataDir, tenantId, invoice } = input;

  // 1. FAIL-CLOSED BEFORE ANY NETWORK: no connection → no provider call.
  const secret = loadTenantStripeSecret(dataDir, tenantId);
  if (!secret) {
    return {
      ok: false,
      reason: "not_connected",
      message: "Online payment is not set up for this invoice. Payment is arranged directly with the issuer.",
    };
  }

  // 2. Amount + currency from the RECORD only (server-side truth).
  const amount = invoice.amountDueCents;
  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      ok: false,
      reason: "invalid_amount",
      message: "This invoice has no payable amount, so a payment cannot be started.",
    };
  }
  const currency = String(invoice.currency || "").trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(currency)) {
    return {
      ok: false,
      reason: "invalid_amount",
      message: "This invoice has no valid currency, so a payment cannot be started.",
    };
  }

  // 3. Create the session on the TENANT'S account, with the TENANT'S key.
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", input.successUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("client_reference_id", invoice.invoiceNumber);
  form.set("metadata[invoice_number]", invoice.invoiceNumber);
  form.set("metadata[payment_source]", "simplerlife100");
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", currency);
  form.set("line_items[0][price_data][unit_amount]", String(amount));
  form.set("line_items[0][price_data][product_data][name]", `Invoice ${invoice.invoiceNumber}`);

  let res: Response;
  try {
    res = await fetch(STRIPE_CHECKOUT_SESSIONS_URL, {
      method: "POST",
      headers: {
        // The TENANT's key. Never logged, never returned, never audited.
        Authorization: `Bearer ${secret.key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "provider_error",
      message: `The payment provider could not be reached (${sanitizeProviderMessage(raw, secret.key)}) — no payment was started.`,
    };
  }

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed?.error?.message) detail = parsed.error.message;
    } catch {
      /* non-JSON error body — use the raw text */
    }
    const clean = sanitizeProviderMessage(detail, secret.key) || `HTTP ${res.status}`;
    return {
      ok: false,
      reason: "provider_error",
      message: `Stripe did not accept the payment request (${clean}). No payment was started.`,
    };
  }

  let body: { id?: unknown; url?: unknown };
  try {
    body = JSON.parse(text) as { id?: unknown; url?: unknown };
  } catch {
    return {
      ok: false,
      reason: "provider_error",
      message: "Stripe returned an unreadable response — no payment was started.",
    };
  }
  if (!isStripeHostedUrl(body.url) || typeof body.id !== "string" || !body.id) {
    return {
      ok: false,
      reason: "provider_error",
      message: "Stripe did not return a checkout link — no payment was started.",
    };
  }
  return { ok: true, url: body.url, sessionId: body.id };
}
