/**
 * native/billing/router.ts — P1-1 (owner 10-22) honest per-tenant BILLING read.
 *
 * GET /api/native/billing (READ-ONLY — never writes):
 *   Returns the CALLING TENANT'S OWN subscription/tier/setup status + recent
 *   invoice list as a clean, safe-projected contract. There is NO public share
 *   surface and NO write verb; prod-server wires this AFTER the session check
 *   so anonymous → 401 (fail-closed; live-probed after every publish).
 *
 * Data truthfulness (owner bar — nothing fabricated):
 *   - When `STRIPE_SECRET_KEY` is present server-side, the handler queries the
 *     Stripe API (customers → subscriptions → invoices → payment_methods) so a
 *     paying tenant sees their REAL Stripe subscription + invoice PDF links.
 *   - When no secret key is available (current live env has only
 *     STRIPE_WEBHOOK_SECRET), the handler returns the tenant's OWN durable
 *     purchase ledger (`tenant_purchases.json` — written only by the
 *     signature-verified Stripe webhook on checkout.session.completed) with
 *     honest `source: "durable"` labeling, or `source: "none"` with
 *     `subscription: null` when the tenant has nothing on file. We NEVER
 *     fabricate a plan, a card, or an invoice.
 *   - Any Stripe API failure falls back to the durable ledger (never 500,
 *     never a fabricated "active" claim).
 *
 * Contract:
 *   { ok: true, billing: {
 *       source: "stripe" | "durable" | "none",
 *       subscription: { planName, tier, amount (USD), interval, status,
 *                       purchasedAt, currentPeriodEnd } | null,
 *       invoices: [{ id, date, description, amount (USD), status, pdfUrl }],
 *       paymentMethod: { brand, last4 } | null
 *   } }
 */
import { join } from "node:path";
import { readJSON, resolveDataDir } from "../../lib/data-store";

export interface NativeBillingCtx {
  userEmail: string;
  dataDir: string;
  /** Injectable for tests; defaults to globalThis.fetch (Bun/Node 18+). */
  stripeFetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface BillingSubscription {
  planName: string | null;
  tier: string | null;
  amount: number | null; // USD dollars, rounded to cents
  interval: "month" | "year" | null;
  status: string | null;
  purchasedAt: string | null; // durable only
  currentPeriodEnd: string | null; // stripe only
  /**
   * Slice 139 — what the subscription state actually means for access:
   * "active" | "at_risk" (a payment is failing but Stripe is still retrying —
   * access is retained) | "revoked" (cancelled / unpaid). Null when unknown.
   */
  access: "active" | "at_risk" | "revoked" | null;
  /** Set while a card is failing; cleared automatically by a later invoice.paid. */
  dunning: { active: boolean; since: string | null; attemptCount: number } | null;
  canceledAt: string | null;
}

export interface BillingInvoice {
  id: string;
  date: string | null;
  description: string | null;
  amount: number | null; // USD dollars
  status: string | null;
  pdfUrl: string | null;
}

export interface NativeBillingView {
  source: "stripe" | "durable" | "none";
  subscription: BillingSubscription | null;
  invoices: BillingInvoice[];
  paymentMethod: { brand: string; last4: string } | null;
}

const LEDGER_FILE = "tenant_purchases.json";

const json405 = () => Response.json({ error: "Method not allowed" }, { status: 405 });
const json401 = () => Response.json({ error: "Not authenticated" }, { status: 401 });

/** Convert Stripe cents (or numeric string cents) to USD dollars, 2dp. */
export function centsToDollars(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value / 100 * 100) / 100;
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return centsToDollars(Number(value));
  }
  return null;
}

function epochToIso(epoch: unknown): string | null {
  const n = typeof epoch === "number" ? epoch : Number(String(epoch ?? ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function ledgerPath(dataDir: string): string {
  return join(resolveDataDir(dataDir, process.cwd()), LEDGER_FILE);
}

/** Durable purchase rows keyed by email → array (structural per-tenant store). */
function durableRows(dataDir: string, tenantId: string): any[] {
  try {
    const ledger = readJSON(ledgerPath(dataDir));
    if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) return [];
    const rows = (ledger as Record<string, any>)[tenantId];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function durableInvoice(row: any): BillingInvoice {
  const date = typeof row.purchasedAt === "string" ? row.purchasedAt : null;
  const amount = centsToDollars(row.amount);
  const name = typeof row.productName === "string" && row.productName.trim()
    ? row.productName.trim()
    : "Platform subscription";
  return {
    id: typeof row.id === "string" ? row.id : (typeof row.stripeSessionId === "string" ? row.stripeSessionId : "purchase"),
    date,
    description: name,
    amount,
    status: typeof row.status === "string" ? row.status : "recorded",
    pdfUrl: null,
  };
}

function durableView(rows: any[]): NativeBillingView {
  if (!rows.length) {
    return { source: "none", subscription: null, invoices: [], paymentMethod: null };
  }
  // Current plan card comes ONLY from a row that carries plan identity
  // (type === "plan" or an explicit productName/tier) — generic rows (e.g. a
  // current-tier checkout under a link the webhook doesn't recognize) appear
  // in invoice history but are never dressed up as a "subscription".
  const planRows = rows.filter((r) => r && (r.type === "plan" || typeof r.tier === "string"));
  let subscription: BillingSubscription | null = null;
  if (planRows.length) {
    const last = planRows[planRows.length - 1];
    subscription = {
      planName: typeof last.productName === "string" ? last.productName : null,
      tier: typeof last.tier === "string" ? last.tier : null,
      amount: centsToDollars(last.amount),
      interval: null,
      // The row's own `status` is the ENTITLEMENT flag (it stays "active"
      // during grace); `subscriptionStatus` is what the subscription is
      // actually doing. Show the latter when the webhook has recorded it.
      status: typeof last.subscriptionStatus === "string"
        ? last.subscriptionStatus
        : typeof last.status === "string" ? last.status : "active",
      purchasedAt: typeof last.purchasedAt === "string" ? last.purchasedAt : null,
      currentPeriodEnd: null,
      // Slice 139 — the row now carries the real subscription state written by
      // the Stripe lifecycle webhook (cancel / past_due / invoice.paid). Shown
      // as-is: a cancelled tenant must never read "active" here.
      access: last.subscriptionAccess === "active" || last.subscriptionAccess === "at_risk" || last.subscriptionAccess === "revoked"
        ? last.subscriptionAccess
        : null,
      dunning: last.dunning && typeof last.dunning === "object"
        ? {
            active: last.dunning.active === true,
            since: typeof last.dunning.since === "string" ? last.dunning.since : null,
            attemptCount: Number.isFinite(Number(last.dunning.attemptCount)) ? Number(last.dunning.attemptCount) : 0,
          }
        : null,
      canceledAt: typeof last.canceledAt === "string" ? last.canceledAt : null,
    };
  }
  const invoices = rows
    .filter((r) => r && r.amount !== undefined && r.amount !== null)
    .map(durableInvoice)
    .sort((a, b) => (a.date && b.date ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) : 0));
  return { source: "durable", subscription, invoices, paymentMethod: null };
}

// ── Stripe API path (only when STRIPE_SECRET_KEY is set) ────────────────────
interface StripeCustomerList { data: any[] }
interface StripeList { data: any[] }

async function stripeGet(
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  secretKey: string,
  path: string,
): Promise<any> {
  const res = await fetchImpl(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!res.ok) throw new Error(`stripe ${path} → HTTP ${res.status}`);
  return res.json();
}

async function stripeView(
  tenantId: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response>,
  secretKey: string,
): Promise<NativeBillingView> {
  const customers = (await stripeGet(fetchImpl, secretKey, `/customers?email=${encodeURIComponent(tenantId)}&limit=1`)) as StripeCustomerList;
  const customer = Array.isArray(customers.data) && customers.data[0] ? customers.data[0] : null;
  if (!customer) throw new Error("no stripe customer for tenant");
  const customerId = typeof customer.id === "string" ? customer.id : "";

  const subs = (await stripeGet(fetchImpl, secretKey, `/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=1`)) as StripeList;
  const sub = Array.isArray(subs.data) && subs.data[0] ? subs.data[0] : null;

  let subscription: BillingSubscription | null = null;
  if (sub) {
    const item = Array.isArray(sub.items?.data) ? sub.items.data[0] : null;
    const price = item?.price;
    subscription = {
      planName: typeof price?.nickname === "string" && price.nickname.trim()
        ? price.nickname.trim()
        : typeof item?.description === "string" && item.description.trim()
          ? item.description.trim()
          : "Platform subscription",
      tier: null,
      amount: centsToDollars(price?.unit_amount),
      interval: price?.recurring?.interval === "year" ? "year" : price?.recurring?.interval === "month" ? "month" : null,
      status: typeof sub.status === "string" ? sub.status : "unknown",
      purchasedAt: null,
      currentPeriodEnd: epochToIso(sub.current_period_end),
      // Slice 139: the live Stripe status is authoritative here, so access is
      // derived from it directly (past_due keeps access — Stripe is retrying).
      access: (() => {
        const s = String(sub.status || "").toLowerCase();
        if (s === "active" || s === "trialing") return "active" as const;
        if (s === "past_due") return "at_risk" as const;
        if (s === "canceled" || s === "unpaid") return "revoked" as const;
        return null;
      })(),
      dunning: String(sub.status || "").toLowerCase() === "past_due"
        ? { active: true, since: null, attemptCount: 0 }
        : null,
      canceledAt: String(sub.status || "").toLowerCase() === "canceled" ? epochToIso(sub.canceled_at) : null,
    };
  }

  const inv = (await stripeGet(fetchImpl, secretKey, `/invoices?customer=${encodeURIComponent(customerId)}&limit=10`)) as StripeList;
  const invoices: BillingInvoice[] = (Array.isArray(inv.data) ? inv.data : []).map((i: any) => {
    const line = Array.isArray(i.lines?.data) ? i.lines.data[0] : null;
    const paid = typeof i.amount_paid === "number" ? i.amount_paid : i.amount_due;
    return {
      id: typeof i.id === "string" ? i.id : "invoice",
      date: epochToIso(i.created),
      description: typeof line?.description === "string" && line.description.trim() ? line.description.trim() : "Subscription invoice",
      amount: centsToDollars(paid),
      status: typeof i.status === "string" ? i.status : "unknown",
      pdfUrl: typeof i.hosted_invoice_url === "string" ? i.hosted_invoice_url : null,
    };
  });

  let paymentMethod: { brand: string; last4: string } | null = null;
  try {
    const pms = (await stripeGet(fetchImpl, secretKey, `/payment_methods?customer=${encodeURIComponent(customerId)}&type=card&limit=1`)) as StripeList;
    const pm = Array.isArray(pms.data) && pms.data[0] ? pms.data[0] : null;
    if (pm?.card && typeof pm.card.brand === "string" && typeof pm.card.last4 === "string") {
      paymentMethod = { brand: pm.card.brand, last4: pm.card.last4 };
    }
  } catch {
    paymentMethod = null; // payment-method detail is optional; never fabricate
  }

  return { source: "stripe", subscription, invoices, paymentMethod };
}

export async function handleNativeBillingAuthed(req: Request, ctx: NativeBillingCtx): Promise<Response> {
  if (req.method !== "GET") return json405();
  const tenantId = (ctx.userEmail || "").trim();
  if (!tenantId) return json401();

  const fetchImpl = ctx.stripeFetch ?? ((url: string, init?: RequestInit) => globalThis.fetch(url, init));
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (secretKey && secretKey.trim()) {
    try {
      return Response.json({ ok: true, billing: await stripeView(tenantId, fetchImpl, secretKey.trim()) });
    } catch (e: any) {
      // Honest fallback — the durable ledger was written from real,
      // signature-verified Stripe webhook events; never 500, never fabricate.
      console.log(`[billing] Stripe read unavailable (${e?.message || "error"}) — falling back to durable ledger`);
    }
  }

  return Response.json({ ok: true, billing: durableView(durableRows(ctx.dataDir, tenantId)) });
}