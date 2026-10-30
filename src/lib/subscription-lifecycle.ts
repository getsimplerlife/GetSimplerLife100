/**
 * subscription-lifecycle.ts — slice 139. The tenant-side state machine for a
 * PLATFORM subscription (our own three Stripe tiers), driven by the
 * subscription/invoice events Stripe sends after the first payment.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until now `/api/stripe/webhook` handled exactly one event
 * (`checkout.session.completed`). Everything that happens to a subscription
 * AFTER the first payment was ignored, so a customer who cancelled stayed
 * `status: "active"` in `tenant_purchases.json` forever and a dead card never
 * changed anything. This module is the pure, dependency-free state machine
 * that fixes that; prod-server.ts owns the I/O (read/write/audit/gate).
 *
 * NOT THE TENANT-INVOICE WEBHOOK
 * ------------------------------
 * `src/native/invoice/*` + the tenant-Stripe webhook deal with the TENANT'S
 * OWN Stripe account (a tenant collecting money from THEIR customers). This
 * module is about OUR account: the three tier subscriptions we sell. They must
 * never be confused — different secret, different store, different meaning.
 *
 * THE ONE RULE THAT MATTERS: NEVER CANCEL THE WRONG CUSTOMER
 * ---------------------------------------------------------
 * Purchases are keyed by customer EMAIL; subscription events carry a
 * `customer` id and a `subscription` id — no email. `resolveTenantForEvent`
 * therefore resolves ONLY from identifiers we ourselves recorded on the
 * purchase row (written by the checkout handler from `session.customer` /
 * `session.subscription`), or from an email Stripe itself states AND that is
 * already a known tenant with no conflicting identifiers. Anything ambiguous
 * resolves to null: the caller then changes NOTHING and audits the event.
 * A missed cancellation is recoverable; a wrong one cancels a paying customer.
 *
 * ACCESS SEMANTICS (deliberate)
 * -----------------------------
 *  - cancellation / `unpaid`  → access REVOKED  (status canceled|unpaid)
 *  - `past_due`               → access AT RISK  (retained — Stripe is retrying)
 *  - `invoice.payment_failed` → access AT RISK, dunning recorded, NEVER revoked
 *                               (a temporary decline must not cut someone off)
 *  - `invoice.paid`           → dunning cleared, access restored automatically
 *  - `invoice.paid` after a cancellation never resurrects the subscription.
 *
 * Out of scope by design (owner brief): proration, plan changes, dunning
 * emails, and any customer-facing billing portal.
 */

/** Status values we act on. Anything else is audited and ignored. */
export type SubscriptionStatus = "active" | "past_due" | "unpaid" | "canceled";

/** What the tenant may do right now. */
export type TenantAccess = "active" | "at_risk" | "revoked";

export interface DunningState {
  /** True while a payment is failing and Stripe is still retrying. */
  active: boolean;
  /** When the FIRST failure of this run was seen (ISO). */
  since: string | null;
  /** Stripe's `attempt_count` for the failing invoice (never invented). */
  attemptCount: number;
  lastInvoiceId: string | null;
  lastEventId: string | null;
  /** Set when a later `invoice.paid` clears the run (ISO). */
  clearedAt?: string | null;
}

/** Durable per-tenant subscription state (`tenant_subscriptions.json`). */
export interface TenantSubscriptionState {
  tenantEmail: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  access: TenantAccess;
  dunning: DunningState | null;
  canceledAt: string | null;
  lastPaidAt: string | null;
  lastPaidAmountCents: number | null;
  lastInvoiceId: string | null;
  updatedAt: string;
}

/** Everything the handler reads and writes, so it can be exercised purely. */
export interface LifecycleStore {
  /** tenant_purchases.json — email → purchase rows. */
  purchases: Record<string, any[]>;
  /** tenant_subscriptions.json — email → subscription state. */
  subscriptions: Record<string, TenantSubscriptionState>;
}

/** A single append-only audit record (`subscription_events.json`). */
export interface LifecycleAuditEntry {
  key: string;
  eventId: string | null;
  type: string;
  at: string;
  outcome: "applied" | "unresolved" | "ignored";
  /** Why the event was not applied (`unresolved`/`ignored`). */
  reason?: string;
  tenantEmail: string | null;
  /** How the tenant was resolved — quoted in the report and in the audit. */
  via: ResolutionVia;
  stripeObjectId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  changes?: Record<string, unknown>;
}

export type ResolutionVia =
  | "subscription_id"
  | "customer_id"
  | "metadata_email"
  | "invoice_email"
  | null;

export interface ResolveResult {
  tenantEmail: string | null;
  via: ResolutionVia;
  reason?: string;
}

/** The event types this slice handles. Anything else is not ours. */
export const SUBSCRIPTION_EVENT_TYPES = [
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.payment_failed",
  "invoice.paid",
] as const;

export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

export function isSubscriptionEventType(type: string | undefined | null): type is SubscriptionEventType {
  return !!type && (SUBSCRIPTION_EVENT_TYPES as readonly string[]).includes(type);
}

/* ───────────────────────────── extraction ─────────────────────────────── */

/** Read an id that Stripe may send either as a string or as an expanded object. */
export function objectId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object") {
    const id = (value as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return null;
}

/** `customer` is `cus_…` on subscription objects and an id OR object on invoices. */
export function extractCustomerId(obj: any): string | null {
  return objectId(obj?.customer);
}

/** `subscription` is `sub_…` on invoice objects; on a subscription object it is `id`. */
export function extractSubscriptionId(obj: any, eventType?: string): string | null {
  const fromField = objectId(obj?.subscription);
  if (fromField) return fromField;
  if (eventType && eventType.startsWith("customer.subscription.")) return objectId(obj?.id);
  return null;
}

/**
 * Emails the event itself states, most authoritative first. These are only
 * ever used as a FALLBACK behind the identifiers we recorded ourselves, and
 * only when the email is already a known tenant.
 */
export function extractEventEmails(obj: any): { email: string; via: ResolutionVia }[] {
  const out: { email: string; via: ResolutionVia }[] = [];
  const push = (value: unknown, via: ResolutionVia) => {
    const email = String(value || "").trim().toLowerCase();
    if (email && email.includes("@") && !out.some((e) => e.email === email)) out.push({ email, via });
  };
  // Metadata is only ours to trust when WE set it (payment-link metadata is
  // `tier` today), so it ranks below Stripe's own customer email.
  push(obj?.metadata?.tenantEmail, "metadata_email");
  push(obj?.metadata?.customerEmail, "metadata_email");
  push(obj?.metadata?.email, "metadata_email");
  push(obj?.customer_email, "invoice_email");
  push(obj?.customer_details?.email, "invoice_email");
  push(obj?.customer?.email, "invoice_email");
  return out;
}

/* ───────────────────────────── resolution ─────────────────────────────── */

function tenantRows(purchases: Record<string, any[]>, email: string): any[] {
  const rows = purchases?.[email];
  return Array.isArray(rows) ? rows : [];
}

/** Emails whose purchase rows carry this subscription id. */
function tenantsBySubscriptionId(purchases: Record<string, any[]>, subId: string): string[] {
  const hits: string[] = [];
  for (const [email, rows] of Object.entries(purchases || {})) {
    if (!Array.isArray(rows)) continue;
    if (rows.some((r) => r && typeof r === "object" && r.stripeSubscriptionId === subId)) hits.push(email);
  }
  return hits;
}

/** Emails whose purchase rows carry this customer id. */
function tenantsByCustomerId(purchases: Record<string, any[]>, customerId: string): string[] {
  const hits: string[] = [];
  for (const [email, rows] of Object.entries(purchases || {})) {
    if (!Array.isArray(rows)) continue;
    if (rows.some((r) => r && typeof r === "object" && r.stripeCustomerId === customerId)) hits.push(email);
  }
  return hits;
}

/**
 * RESOLUTION RULE (the correctness core of this slice) — tried in order:
 *
 *  1. `subscription_id` — a purchase row whose `stripeSubscriptionId` equals
 *     the event's subscription id. Exactly one tenant must match.
 *  2. `customer_id` — a purchase row whose `stripeCustomerId` equals the
 *     event's customer id. Exactly one tenant must match.
 *  3. `metadata_email` / `invoice_email` — an email the event itself states,
 *     accepted ONLY when it is already a known tenant AND that tenant's rows
 *     carry no CONFLICTING customer/subscription id.
 *
 * A tie (two tenants matching one id) or a conflict (the named tenant belongs
 * to a different subscription/customer) is NOT resolved — never guessed.
 */
export function resolveTenantForEvent(
  purchases: Record<string, any[]>,
  refs: { subscriptionId?: string | null; customerId?: string | null; emails?: { email: string; via: ResolutionVia }[] },
): ResolveResult {
  const subId = String(refs.subscriptionId || "").trim();
  if (subId) {
    const hits = tenantsBySubscriptionId(purchases, subId);
    if (hits.length === 1) return { tenantEmail: hits[0], via: "subscription_id" };
    if (hits.length > 1) return { tenantEmail: null, via: null, reason: "ambiguous_subscription_id" };
  }

  const customerId = String(refs.customerId || "").trim();
  if (customerId) {
    const hits = tenantsByCustomerId(purchases, customerId);
    if (hits.length === 1) return { tenantEmail: hits[0], via: "customer_id" };
    if (hits.length > 1) return { tenantEmail: null, via: null, reason: "ambiguous_customer_id" };
  }

  for (const candidate of refs.emails || []) {
    const email = String(candidate.email || "").trim().toLowerCase();
    if (!email) continue;
    if (!Object.prototype.hasOwnProperty.call(purchases || {}, email)) continue; // never invent a tenant
    const rows = tenantRows(purchases, email);
    if (!rows.length) continue;
    const conflictingSub = subId
      ? rows.some((r) => r && r.stripeSubscriptionId && r.stripeSubscriptionId !== subId)
      : false;
    const conflictingCustomer = customerId
      ? rows.some((r) => r && r.stripeCustomerId && r.stripeCustomerId !== customerId)
      : false;
    if (conflictingSub || conflictingCustomer) continue; // the ids say otherwise — do not guess
    return { tenantEmail: email, via: candidate.via };
  }

  return { tenantEmail: null, via: null, reason: "no_matching_tenant" };
}

/* ───────────────────────────── state model ────────────────────────────── */

/** Access implied by a subscription status. past_due keeps access on purpose. */
export function accessForStatus(status: SubscriptionStatus): TenantAccess {
  if (status === "active") return "active";
  if (status === "past_due") return "at_risk";
  return "revoked"; // canceled | unpaid
}

/** Map a Stripe subscription status onto one we act on, or null (ignore). */
export function normalizeSubscriptionStatus(raw: unknown): SubscriptionStatus | null {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due") return "past_due";
  if (s === "unpaid") return "unpaid";
  if (s === "canceled") return "canceled";
  return null;
}

function blankState(tenantEmail: string, at: string): TenantSubscriptionState {
  return {
    tenantEmail,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: "active",
    access: "active",
    dunning: null,
    canceledAt: null,
    lastPaidAt: null,
    lastPaidAmountCents: null,
    lastInvoiceId: null,
    updatedAt: at,
  };
}

/** Read a tenant's current state, defaulting to "active" (a purchase exists). */
export function readTenantState(
  store: LifecycleStore,
  tenantEmail: string,
  at: string,
): TenantSubscriptionState {
  const existing = store.subscriptions?.[tenantEmail];
  if (existing && typeof existing === "object") {
    return { ...blankState(tenantEmail, at), ...existing, tenantEmail };
  }
  // Derive a starting point from the ledger so an un-tracked tenant that is
  // already cancelled does not read "active" until the next event.
  const rows = tenantRows(store.purchases, tenantEmail);
  const lastPlan = [...rows].reverse().find((r) => r && typeof r === "object" && (r.type === "plan" || typeof r.tier === "string"));
  const base = blankState(tenantEmail, at);
  if (lastPlan) {
    const status = normalizeSubscriptionStatus(lastPlan.subscriptionStatus || lastPlan.status) || "active";
    base.status = status;
    base.access = accessForStatus(status);
    base.stripeCustomerId = typeof lastPlan.stripeCustomerId === "string" ? lastPlan.stripeCustomerId : null;
    base.stripeSubscriptionId = typeof lastPlan.stripeSubscriptionId === "string" ? lastPlan.stripeSubscriptionId : null;
    base.canceledAt = typeof lastPlan.canceledAt === "string" ? lastPlan.canceledAt : null;
    base.lastPaidAt = typeof lastPlan.lastPaidAt === "string" ? lastPlan.lastPaidAt : null;
  }
  return base;
}

/**
 * Mirror the tenant's state onto the purchase rows the portal already reads
 * (`/api/native/billing` renders `status` from the newest plan row). Rows are
 * copied, never mutated in place, and never dropped.
 *
 * Which rows: the rows belonging to THIS subscription id when the rows carry
 * ids; otherwise the tenant's own active plan rows. A tenant's other, older
 * subscription is left alone — cancelling one must not cancel the other.
 */
export function projectStateOntoRows(
  rows: any[],
  state: TenantSubscriptionState,
  opts: { subscriptionId?: string | null; at: string },
): any[] {
  if (!Array.isArray(rows)) return rows;
  const subId = String(opts.subscriptionId || state.stripeSubscriptionId || "").trim();
  const isPlanRow = (r: any) => r && typeof r === "object" && (r.type === "plan" || typeof r.tier === "string");
  const withIds = subId ? rows.filter((r) => r && r.stripeSubscriptionId === subId) : [];
  const targets = withIds.length
    ? new Set(withIds)
    : new Set(rows.filter((r) => isPlanRow(r) && String(r.status || "active").toLowerCase() === "active"));
  return rows.map((row) => {
    if (!targets.has(row)) return row;
    const next: any = { ...row, subscriptionStatus: state.status, subscriptionAccess: state.access, subscriptionUpdatedAt: opts.at };
    // The row's OWN `status` is the entitlement flag the gates hydrate from
    // (hydrateTenants grants while it reads "active"). Grace must therefore
    // keep it "active": a failing card is at risk, not cut off. Only a real
    // revocation flips it.
    if (state.access === "revoked") next.status = state.status;
    else if (state.access === "active") next.status = "active";
    if (state.stripeCustomerId) next.stripeCustomerId = state.stripeCustomerId;
    if (state.stripeSubscriptionId) next.stripeSubscriptionId = state.stripeSubscriptionId;
    if (state.canceledAt) next.canceledAt = state.canceledAt;
    if (state.lastPaidAt) next.lastPaidAt = state.lastPaidAt;
    if (state.lastInvoiceId) next.lastInvoiceId = state.lastInvoiceId;
    if (state.dunning) next.dunning = { ...state.dunning };
    return next;
  });
}

/* ───────────────────────────── apply ──────────────────────────────────── */

export interface LifecycleOutcome {
  /** True when the store changed. */
  applied: boolean;
  /** Set when not applied: "unresolved" | "ignored". */
  outcome: "applied" | "unresolved" | "ignored";
  reason?: string;
  tenantEmail: string | null;
  via: ResolutionVia;
  store: LifecycleStore;
  state: TenantSubscriptionState | null;
  audit: LifecycleAuditEntry;
}

/**
 * Idempotency key for the audit trail. Stripe event ids are stable across
 * redelivery, so they are the key when present. Without one (hand-built
 * payloads, some replays) we fall back to a key that includes the resulting
 * state signature, so an identical redelivery still applies exactly once
 * while a genuinely different later change is still applied.
 */
export function lifecycleEventKey(input: {
  type: string;
  eventId?: string | null;
  objectId?: string | null;
  signature?: string;
}): string {
  const id = String(input.eventId || "").trim();
  if (id) return id;
  return [input.type, input.objectId || "no-object", input.signature || "no-signature"].join(":");
}

/** Build the audit entry for an outcome (also used for unresolved events). */
export function buildAuditEntry(input: {
  key: string;
  type: string;
  eventId?: string | null;
  at: string;
  outcome: LifecycleOutcome["outcome"];
  reason?: string;
  tenantEmail: string | null;
  via: ResolutionVia;
  object: any;
  status?: string | null;
  changes?: Record<string, unknown>;
}): LifecycleAuditEntry {
  return {
    key: input.key,
    eventId: String(input.eventId || "").trim() || null,
    type: input.type,
    at: input.at,
    outcome: input.outcome,
    ...(input.reason ? { reason: input.reason } : {}),
    tenantEmail: input.tenantEmail,
    via: input.via,
    stripeObjectId: objectId(input.object?.id),
    stripeCustomerId: extractCustomerId(input.object),
    stripeSubscriptionId: extractSubscriptionId(input.object, input.type),
    status: input.status ?? (typeof input.object?.status === "string" ? input.object.status : null),
    ...(input.changes ? { changes: input.changes } : {}),
  };
}

function unchanged(store: LifecycleStore): LifecycleStore {
  return store;
}

/**
 * Apply ONE Stripe subscription-lifecycle event to the store. Pure: returns a
 * NEW store when something changed and the SAME store when nothing did.
 *
 * `opts.auditKey` is required so the caller can persist the audit entry under
 * the same key it used for the duplicate check.
 */
export function applySubscriptionEvent(input: {
  store: LifecycleStore;
  type: string;
  eventId?: string | null;
  object: any;
  at?: string;
  auditKey?: string;
}): LifecycleOutcome {
  const at = input.at || new Date().toISOString();
  const type = String(input.type || "");
  const object = input.object || {};
  const purchases = (input.store?.purchases && typeof input.store.purchases === "object") ? input.store.purchases : {};
  const subscriptions = (input.store?.subscriptions && typeof input.store.subscriptions === "object") ? input.store.subscriptions : {};
  const store: LifecycleStore = { purchases, subscriptions };

  const subscriptionId = extractSubscriptionId(object, type);
  const customerId = extractCustomerId(object);
  const resolution = resolveTenantForEvent(purchases, {
    subscriptionId,
    customerId,
    emails: extractEventEmails(object),
  });

  const key = input.auditKey || lifecycleEventKey({
    type,
    eventId: input.eventId,
    objectId: objectId(object?.id),
    signature: stateSignature(object, type),
  });

  const base = {
    key,
    type,
    eventId: input.eventId,
    at,
    tenantEmail: resolution.tenantEmail,
    via: resolution.via,
    object,
  };

  if (!resolution.tenantEmail) {
    // NEVER guess and NEVER create a record — the caller audits this and 200s.
    return {
      applied: false,
      outcome: "unresolved",
      reason: resolution.reason || "no_matching_tenant",
      tenantEmail: null,
      via: null,
      store: unchanged(store),
      state: null,
      audit: buildAuditEntry({ ...base, outcome: "unresolved", reason: resolution.reason || "no_matching_tenant" }),
    };
  }

  const email = resolution.tenantEmail;
  const prev = readTenantState(store, email, at);
  const next: TenantSubscriptionState = {
    ...prev,
    tenantEmail: email,
    stripeCustomerId: customerId || prev.stripeCustomerId,
    stripeSubscriptionId: subscriptionId || prev.stripeSubscriptionId,
    updatedAt: at,
  };
  let changes: Record<string, unknown> = {};
  let ignoredReason: string | null = null;

  if (type === "customer.subscription.deleted" || type === "customer.subscription.updated") {
    const rawStatus = type === "customer.subscription.deleted" ? "canceled" : object?.status;
    const status = normalizeSubscriptionStatus(rawStatus);
    if (!status) {
      ignoredReason = "unsupported_subscription_status";
    } else {
      next.status = status;
      next.access = accessForStatus(status);
      if (status === "canceled" || status === "unpaid") {
        next.canceledAt = next.canceledAt || at;
        next.dunning = next.dunning ? { ...next.dunning, active: false } : null;
      } else if (status === "past_due") {
        // At risk, NOT revoked: Stripe is still retrying this card.
        next.canceledAt = null;
        next.dunning = {
          active: true,
          since: next.dunning?.since || at,
          attemptCount: Math.max(1, next.dunning?.attemptCount || 1),
          lastInvoiceId: next.dunning?.lastInvoiceId || null,
          lastEventId: input.eventId || next.dunning?.lastEventId || null,
        };
      } else {
        // active / trialing — recovered.
        next.canceledAt = null;
        next.dunning = next.dunning?.active
          ? { ...next.dunning, active: false, clearedAt: at }
          : next.dunning;
      }
      changes = { status: next.status, access: next.access };
    }
  } else if (type === "invoice.payment_failed") {
    const attemptCount = Number(object?.attempt_count);
    next.status = "past_due";
    next.access = "at_risk";
    next.dunning = {
      active: true,
      since: next.dunning?.active ? next.dunning.since : at,
      attemptCount: Number.isFinite(attemptCount) && attemptCount > 0
        ? Math.floor(attemptCount)
        : Math.max(1, (next.dunning?.attemptCount || 0) + 1),
      lastInvoiceId: objectId(object?.id) || next.dunning?.lastInvoiceId || null,
      lastEventId: input.eventId || next.dunning?.lastEventId || null,
    };
    next.lastInvoiceId = objectId(object?.id) || next.lastInvoiceId;
    // Access is DELIBERATELY retained: Stripe retries a declined card, and
    // cutting a customer off on a temporary decline is worse than grace.
    changes = { status: next.status, access: next.access, attemptCount: next.dunning.attemptCount };
  } else if (type === "invoice.paid") {
    const amount = Number(object?.amount_paid);
    next.lastPaidAt = at;
    next.lastPaidAmountCents = Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : next.lastPaidAmountCents;
    next.lastInvoiceId = objectId(object?.id) || next.lastInvoiceId;
    if (prev.status === "canceled") {
      // A final invoice can be paid after cancellation — never resurrect it.
      ignoredReason = "canceled_subscription_not_reactivated";
      next.status = prev.status;
      next.access = prev.access;
    } else {
      next.status = "active";
      next.access = "active";
      next.canceledAt = null;
      next.dunning = prev.dunning
        ? { ...prev.dunning, active: false, clearedAt: at }
        : { active: false, since: null, attemptCount: 0, lastInvoiceId: next.lastInvoiceId, lastEventId: input.eventId || null, clearedAt: at };
      changes = { status: next.status, access: next.access, dunningCleared: true };
    }
  } else {
    ignoredReason = "unsupported_event_type";
  }

  if (ignoredReason) {
    return {
      applied: false,
      outcome: "ignored",
      reason: ignoredReason,
      tenantEmail: email,
      via: resolution.via,
      store: unchanged(store),
      state: prev,
      audit: buildAuditEntry({ ...base, outcome: "ignored", reason: ignoredReason, changes }),
    };
  }

  const nextRows = projectStateOntoRows(tenantRows(purchases, email), next, { subscriptionId, at });
  const nextStore: LifecycleStore = {
    purchases: { ...purchases, [email]: nextRows },
    subscriptions: { ...subscriptions, [email]: next },
  };

  return {
    applied: true,
    outcome: "applied",
    tenantEmail: email,
    via: resolution.via,
    store: nextStore,
    state: next,
    audit: buildAuditEntry({ ...base, outcome: "applied", changes }),
  };
}

/**
 * The part of an event that determines the resulting state. Used only for the
 * fallback idempotency key when Stripe sends no event id.
 */
export function stateSignature(object: any, type: string): string {
  const bits: string[] = [];
  if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
    bits.push(String(object?.status || (type === "customer.subscription.deleted" ? "canceled" : "")));
  }
  if (type === "invoice.payment_failed") {
    bits.push("attempt=" + String(object?.attempt_count ?? ""));
    bits.push("invoice=" + String(object?.id ?? ""));
  }
  if (type === "invoice.paid") {
    bits.push("paid=" + String(object?.amount_paid ?? ""));
    bits.push("invoice=" + String(object?.id ?? ""));
  }
  return bits.join("|");
}

/* ────────────────────────── operator projection ───────────────────────── */

/**
 * One honest line per tenant for the operator view (owner admin). Reads only
 * what is on disk — no inference, no fabricated "healthy".
 */
export interface SubscriptionSummary {
  tenantEmail: string;
  status: SubscriptionStatus | "unknown";
  access: TenantAccess | "unknown";
  planName: string | null;
  dunning: DunningState | null;
  canceledAt: string | null;
  lastPaidAt: string | null;
  updatedAt: string | null;
}

export function summarizeSubscriptions(store: LifecycleStore): SubscriptionSummary[] {
  const emails = new Set<string>([
    ...Object.keys(store.subscriptions || {}),
    ...Object.keys(store.purchases || {}),
  ]);
  const out: SubscriptionSummary[] = [];
  for (const email of emails) {
    const rows = tenantRows(store.purchases, email);
    if (!rows.length && !store.subscriptions?.[email]) continue;
    const state = store.subscriptions?.[email];
    const lastPlan = [...rows].reverse().find((r) => r && typeof r === "object" && (r.type === "plan" || typeof r.tier === "string"));
    const known = normalizeSubscriptionStatus(state?.status || lastPlan?.status);
    const derivedStatus: SubscriptionStatus | "unknown" = known || "unknown";
    out.push({
      tenantEmail: email,
      status: derivedStatus,
      access: state?.access || (known ? accessForStatus(known) : "unknown"),
      planName: typeof lastPlan?.productName === "string" ? lastPlan.productName : null,
      dunning: state?.dunning || (lastPlan?.dunning as DunningState | undefined) || null,
      canceledAt: state?.canceledAt || (typeof lastPlan?.canceledAt === "string" ? lastPlan.canceledAt : null),
      lastPaidAt: state?.lastPaidAt || (typeof lastPlan?.lastPaidAt === "string" ? lastPlan.lastPaidAt : null),
      updatedAt: state?.updatedAt || null,
    });
  }
  return out.sort((a, b) => a.tenantEmail.localeCompare(b.tenantEmail));
}
