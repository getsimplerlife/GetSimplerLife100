/**
 * entitlements.ts — slice 142. ONE source of truth for what each tier includes.
 *
 * WHY THIS EXISTS
 * ---------------
 * Three tiers are sold at $199 / $599 / $1,499 and — until this slice — not a
 * single difference between them was enforced. A Starter customer got every
 * Enterprise capability. This module is the decision layer; the gates import
 * it, and the portal billing page renders from it, so the page can never
 * promise more than the gate allows (and no gate may refuse what the page
 * does not state).
 *
 * THE PRINCIPLE (owner-approved, do not renegotiate it here)
 * ---------------------------------------------------------
 * Gate SCALE, CONTROL and COMPLIANCE. NEVER the core quote-to-cash job.
 * A paying Starter customer must be able to run proposal → e-sign → checklist
 * → deal room → invoice → notify → pay → filed, in full, forever. If an
 * enforcement decision would block any step of that chain, the decision is
 * wrong. That is why `quoteToCash`, `freePrimitives` and `approvalsQueue` are
 * `true` for EVERY tier — the approvals queue is how a tenant approves its own
 * gated writes, so gating it would strand a Starter customer's own invoice.
 *
 * PURITY: this file imports nothing. No node built-ins, no I/O, no data-store.
 * The server-side loader lives in `entitlement-store.ts`; keeping the decision
 * itself pure is what makes it unit-testable and safe in the client bundle.
 *
 * FAILURE DIRECTION (deliberate)
 * ------------------------------
 *  - No purchase on record (`none`) → NOT a customer: no paid limit is
 *    invented and no gate is enforced (`enforce: false`). The free primitives
 *    stay open, exactly as the approved contents require.
 *  - A purchase we can PROVE (tier field, else the amount they paid) → that
 *    tier, enforced.
 *  - A plan purchase whose tier we cannot read and whose amount we cannot
 *    match → the most conservative paid tier (Starter) with `uncertain: true`,
 *    surfaced on the billing page. It never over-grants (no invented
 *    Enterprise) and it never locks anyone out of the core job, because the
 *    only things Starter gates are scale and control.
 */

export type Tier = "starter" | "growth" | "enterprise" | "none";
export type PaidTier = Exclude<Tier, "none">;

export const PAID_TIERS: readonly PaidTier[] = ["starter", "growth", "enterprise"] as const;

/** Monthly prices in cents — the same numbers Stripe bills (owner-locked). */
export const TIER_PRICE_CENTS: Record<PaidTier, number> = {
  starter: 19900,
  growth: 59900,
  enterprise: 149900,
};

export const TIER_MONTHLY_USD: Record<PaidTier, number> = {
  starter: 199,
  growth: 599,
  enterprise: 1499,
};

export const TIER_LABEL: Record<Tier, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
  none: "No plan on file",
};

/** What a tier scales to. `null` means "no cap we can state" (custom/unlimited). */
export interface TierLimits {
  /** Named users. Approved content; NOT enforced in this slice (see plan). */
  seats: number | null;
  /** Rows written by an import per calendar month. ENFORCED (slice 142). */
  importRowsPerMonth: number | null;
  /** Audit-log retention window in days. NOT enforced in this slice. */
  auditRetentionDays: number | null;
  /** Full audit export. NOT enforced in this slice. */
  auditExport: boolean;
  /** How many provider API adapters may be used. null = all. Not built yet. */
  apiAdapters: number | null;
}

/** What a tier can do. Anything `true` for every tier is not a paywall. */
export interface TierFeatures {
  /** The whole quote-to-cash chain. TRUE FOR EVERY TIER, ALWAYS. */
  quoteToCash: boolean;
  /** Forms, tables, dashboards, knowledge base — open to everyone. */
  freePrimitives: boolean;
  /** The approval queue a tenant uses to approve its own gated writes. */
  approvalsQueue: boolean;
  /** Autonomy allow-lists, kill switch, error budget (Growth+). */
  controlPlane: boolean;
  /** DPA on request. */
  dpa: boolean;
  /** SSO/SAML. */
  sso: boolean;
  /** Provider API adapters available at all (the capability, not the count). */
  apiAdapters: boolean;
}

export interface TierSpec {
  tier: PaidTier;
  label: string;
  monthlyUsd: number;
  limits: TierLimits;
  features: TierFeatures;
  support: string;
  onboarding: string;
}

/**
 * APPROVED TIER CONTENTS (owner 2026-10-30, plan rev 419). These are the only
 * numbers this codebase may enforce or advertise. Changing one here changes
 * the gate, the billing page and the pricing page together — that is the
 * point of the single source of truth.
 */
export const TIER_SPECS: Record<PaidTier, TierSpec> = {
  starter: {
    tier: "starter",
    label: "Starter",
    monthlyUsd: 199,
    limits: {
      seats: 3,
      importRowsPerMonth: 10000,
      auditRetentionDays: 90,
      auditExport: false,
      apiAdapters: 0,
    },
    features: {
      quoteToCash: true,
      freePrimitives: true,
      approvalsQueue: true,
      controlPlane: false,
      dpa: false,
      sso: false,
      apiAdapters: false,
    },
    support: "Email support, 2 business days",
    onboarding: "Self-serve onboarding",
  },
  growth: {
    tier: "growth",
    label: "Growth",
    monthlyUsd: 599,
    limits: {
      seats: 15,
      importRowsPerMonth: 100000,
      auditRetentionDays: 365,
      auditExport: true,
      apiAdapters: 3,
    },
    features: {
      quoteToCash: true,
      freePrimitives: true,
      approvalsQueue: true,
      controlPlane: true,
      dpa: true,
      sso: false,
      apiAdapters: true,
    },
    support: "Next-business-day support",
    onboarding: "Guided onboarding",
  },
  enterprise: {
    tier: "enterprise",
    label: "Enterprise",
    monthlyUsd: 1499,
    limits: {
      seats: null, // unlimited
      importRowsPerMonth: null, // custom volume
      auditRetentionDays: null, // configurable
      auditExport: true,
      apiAdapters: null, // all adapters
    },
    features: {
      quoteToCash: true,
      freePrimitives: true,
      approvalsQueue: true,
      controlPlane: true,
      dpa: true,
      sso: true,
      apiAdapters: true,
    },
    support: "Named contact, 4-hour response",
    onboarding: "Named onboarding + quarterly review",
  },
};

/** The spec a gate must use. `none` is not a customer: no paid limits exist. */
export function specForTier(tier: Tier): TierSpec | null {
  return tier === "none" ? null : TIER_SPECS[tier];
}

/** Limits for a non-customer: nothing paid is granted, nothing is invented. */
export const NO_PLAN_LIMITS: TierLimits = {
  seats: null,
  importRowsPerMonth: null,
  auditRetentionDays: null,
  auditExport: false,
  apiAdapters: 0,
};

/** Features a non-customer keeps: the free primitives and the core chain. */
export const NO_PLAN_FEATURES: TierFeatures = {
  quoteToCash: true,
  freePrimitives: true,
  approvalsQueue: true,
  controlPlane: false,
  dpa: false,
  sso: false,
  apiAdapters: false,
};

/* ───────────────────────────── resolution ─────────────────────────────── */

export type TierSource = "owner" | "purchase_tier" | "purchase_amount" | "account" | "none";

export type AccessState = "active" | "at_risk" | "revoked" | "unknown";

export interface Entitlement {
  email: string;
  tier: Tier;
  label: string;
  /** Where the tier came from — quoted on the billing page, never guessed. */
  tierSource: TierSource;
  /** True when the tier was inferred (unreadable tier/amount on a real plan). */
  uncertain: boolean;
  /**
   * TRUE only when we can prove a paid tier. Gates enforce on `enforce`
   * tenants only: a tenant with no purchase has no paid limit to enforce, and
   * an unknown account must never be locked out of its own core job.
   */
  enforce: boolean;
  access: AccessState;
  planName: string | null;
  limits: TierLimits;
  features: TierFeatures;
  /** Honest, human sentence about how the tier was determined (billing page). */
  note: string;
}

/** Normalize any stored tier string. Unknown → null (never invented). */
export function normalizeTier(raw: unknown): PaidTier | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;
  if (key === "starter" || key === "growth" || key === "enterprise") return key;
  // Product-name spellings we ourselves write ("Starter Plan").
  const bare = key.replace(/\s*plan$/, "").replace(/\s+/g, "");
  if (bare === "starter" || bare === "growth" || bare === "enterprise") return bare;
  return null;
}

/**
 * How far ABOVE a rung's monthly price an amount may sit and still be read as
 * that rung (sales tax, a rounding difference). It is small and ONE-SIDED on
 * purpose: an amount below a rung's price never proves that rung, and an
 * amount well above it is that rung plus something we cannot identify.
 */
const AMOUNT_TOLERANCE_RATIO = 0.05;
/**
 * Infer the tier from the amount actually paid. This is a LAST RESORT: it runs
 * only when the purchase row carries no readable `tier`. The `tier` the
 * signature-verified Stripe webhook wrote from `metadata.tier` (and the payment
 * link's own metadata) ALWAYS wins over anything inferred here.
 *
 * The rule is ROUND DOWN, NEVER UP — the amount may never grant a tier above
 * what the money proves:
 *   1. An amount that meets a rung's monthly price (within a few percent above
 *      it) proves that rung.
 *   2. Anything else is ambiguous. $699.00 is either Starter plus a one-time
 *      setup fee or Growth alone, and the number cannot tell us which. Ambiguity resolves
 *      to the LOWEST paid rung — never to the nearest one, because handing
 *      Growth to someone who paid for Starter is an over-grant. The caller
 *      flags the result `uncertain: true` so the billing page says so.
 *   3. Below the entry rung's price nothing is proven at all → null.
 */
export function tierFromAmountCents(cents: unknown): PaidTier | null {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return null;
  const rungs = PAID_TIERS.map((tier) => ({ tier, price: TIER_PRICE_CENTS[tier] })).sort((a, b) => a.price - b.price);
  const proven = rungs.find((r) => n >= r.price && n <= r.price * (1 + AMOUNT_TOLERANCE_RATIO));
  if (proven) return proven.tier;
  const entry = rungs[0];
  return entry && n >= entry.price ? entry.tier : null;
}

function rowsForEmail(purchases: Record<string, any[]> | undefined, email: string): any[] {
  if (!purchases || typeof purchases !== "object") return [];
  const direct = purchases[email];
  if (Array.isArray(direct)) return direct;
  const lower = email.toLowerCase();
  for (const [key, rows] of Object.entries(purchases)) {
    if (key.toLowerCase() === lower && Array.isArray(rows)) return rows;
  }
  return [];
}

function subscriptionForEmail(subscriptions: Record<string, any> | undefined, email: string): any | null {
  if (!subscriptions || typeof subscriptions !== "object") return null;
  const direct = subscriptions[email];
  if (direct && typeof direct === "object") return direct;
  const lower = email.toLowerCase();
  for (const [key, value] of Object.entries(subscriptions)) {
    if (key.toLowerCase() === lower && value && typeof value === "object") return value;
  }
  return null;
}

/** The newest row that actually identifies a plan (type "plan" or a tier). */
function newestPlanRow(rows: any[]): any | null {
  const planRows = (Array.isArray(rows) ? rows : []).filter(
    (r) => r && typeof r === "object" && (r.type === "plan" || typeof r.tier === "string"),
  );
  return planRows.length ? planRows[planRows.length - 1] : null;
}

function accessFromStatus(status: unknown): AccessState {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return "unknown";
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due") return "at_risk";
  if (s === "canceled" || s === "cancelled" || s === "unpaid") return "revoked";
  return "unknown";
}

/**
 * Resolve a tenant's entitlement from the stores we already have.
 *
 * The SUBSCRIPTION record (slice 139) is authoritative for the tenant's STATE
 * (active / at_risk / revoked); the PURCHASE row is authoritative for the
 * TIER, because it is the row the signature-verified Stripe webhook wrote
 * with `metadata.tier`. Both are populated by the same checkout event.
 */
export function resolveEntitlement(input: {
  email?: string | null;
  purchases?: Record<string, any[]> | null;
  subscriptions?: Record<string, any> | null;
  /** users.json[email].entitlements.tier — last-resort tier signal. */
  accountTier?: string | null;
  /** Platform owner (role admin/owner) — the owner is not a customer. */
  owner?: boolean;
}): Entitlement {
  const email = String(input.email ?? "").trim();
  const rows = rowsForEmail(input.purchases ?? undefined, email);
  const planRow = newestPlanRow(rows);
  const sub = subscriptionForEmail(input.subscriptions ?? undefined, email);

  // ── access (state) ────────────────────────────────────────────────────
  let access: AccessState = "unknown";
  if (sub && typeof sub.access === "string") {
    const a = sub.access === "active" || sub.access === "at_risk" || sub.access === "revoked" ? sub.access : null;
    access = a ?? accessFromStatus(sub.status);
  } else if (planRow) {
    access = accessFromStatus(planRow.subscriptionStatus || planRow.status);
  }

  // ── tier ──────────────────────────────────────────────────────────────
  let tier: Tier = "none";
  let tierSource: TierSource = "none";
  let uncertain = false;

  const fromRow = planRow ? normalizeTier(planRow.tier) : null;
  if (fromRow) {
    tier = fromRow;
    tierSource = "purchase_tier";
  } else if (planRow) {
    // A plan exists but its tier is unreadable — the amount they paid is the
    // proof we have. If even that fails, fall to the conservative paid tier.
    const fromAmount = tierFromAmountCents(planRow.amount);
    if (fromAmount) {
      tier = fromAmount;
      tierSource = "purchase_amount";
      uncertain = true;
    } else {
      tier = "starter";
      tierSource = "purchase_amount";
      uncertain = true;
    }
  } else {
    const fromAccount = normalizeTier(input.accountTier);
    if (fromAccount) {
      tier = fromAccount;
      tierSource = "account";
    }
  }

  // The platform owner runs their own account: full capability, not a sale.
  if (input.owner) {
    tier = "enterprise";
    tierSource = "owner";
    uncertain = false;
  }

  const spec = specForTier(tier);
  const limits = spec ? { ...spec.limits } : { ...NO_PLAN_LIMITS };
  const features = spec ? { ...spec.features } : { ...NO_PLAN_FEATURES };

  const planName = planRow && typeof planRow.productName === "string" ? planRow.productName : null;
  const note = (() => {
    if (tierSource === "owner") return "Platform owner account — full capability, not a customer plan.";
    if (tierSource === "purchase_tier") return `Tier recorded on your Stripe purchase${planName ? ` (${planName})` : ""}.`;
    if (tierSource === "purchase_amount") {
      return uncertain
        ? "We could not read the tier on your purchase record, so your limits come from the amount you paid. Contact us and we will correct the record."
        : "Tier taken from the amount you paid.";
    }
    if (tierSource === "account") return "Tier recorded on your account.";
    return "No plan on file. The free primitives and the full quote-to-cash chain stay open; paid limits start when you subscribe.";
  })();

  return {
    email,
    tier,
    label: TIER_LABEL[tier],
    tierSource,
    uncertain,
    enforce: tier !== "none",
    access,
    planName,
    limits,
    features,
    note,
  };
}

/* ───────────────────────────── import volume ──────────────────────────── */

/** `YYYY-MM` for an ISO timestamp (UTC). Invalid input → "" (never counts). */
export function monthKeyOf(value: string | Date | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 7);
}

/**
 * Rows this tenant has actually WRITTEN this calendar month, across both
 * import lanes:
 *  - universal file import: jobs with status "committed" (committedAt)
 *  - provider import: `commitImport` runs (at) that report a committed count
 * Nothing is estimated: only rows a store actually accepted are counted.
 */
export function countImportRowsInMonth(
  input: { fileJobs?: any[] | null; importRuns?: any[] | null },
  monthKey: string,
): number {
  if (!monthKey) return 0;
  let total = 0;
  for (const job of input.fileJobs || []) {
    if (!job || typeof job !== "object") continue;
    if (job.status !== "committed") continue;
    if (monthKeyOf(job.committedAt) !== monthKey) continue;
    const n = Number(job.committedCount);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  for (const run of input.importRuns || []) {
    if (!run || typeof run !== "object") continue;
    if (run.op !== "commitImport") continue;
    if (monthKeyOf(run.at) !== monthKey) continue;
    const n = Number(run.committed);
    if (Number.isFinite(n) && n > 0) total += n;
  }
  return total;
}

export interface ImportQuotaResult {
  allowed: boolean;
  /** null = no stated cap for this tier (custom/unlimited). */
  limit: number | null;
  used: number;
  requested: number;
  remaining: number | null;
  /** Honest refusal text naming the tier and the limit. Empty when allowed. */
  message: string;
  /** The tier that would lift the limit, when one would. */
  upgradeTo: PaidTier | null;
}

const fmtInt = (n: number) => n.toLocaleString("en-US");

/**
 * The import-volume decision. Pure: the caller supplies what has been used.
 * Unlimited tiers (`limit === null`) never refuse.
 */
export function checkImportQuota(
  ent: Entitlement,
  usedRows: number,
  requestedRows: number,
  opts: { unitLabel?: string } = {},
): ImportQuotaResult {
  const used = Math.max(0, Math.floor(Number(usedRows) || 0));
  const requested = Math.max(0, Math.floor(Number(requestedRows) || 0));
  const unit = opts.unitLabel || "imported rows per month";

  if (!ent.enforce) {
    return { allowed: true, limit: null, used, requested, remaining: null, message: "", upgradeTo: null };
  }
  const limit = ent.limits.importRowsPerMonth;
  if (limit === null || !Number.isFinite(limit)) {
    return { allowed: true, limit: null, used, requested, remaining: null, message: "", upgradeTo: null };
  }
  const remaining = Math.max(0, limit - used);
  if (used + requested <= limit) {
    return { allowed: true, limit, used, requested, remaining, message: "", upgradeTo: null };
  }
  const upgradeTo: PaidTier | null = ent.tier === "starter" ? "growth" : ent.tier === "growth" ? "enterprise" : null;
  const next = upgradeTo ? TIER_SPECS[upgradeTo] : null;
  const message =
    `Import refused: the ${ent.label} plan includes ${fmtInt(limit)} ${unit} and you have already imported ${fmtInt(used)} this month; ` +
    `this import would add ${fmtInt(requested)}. Nothing was written.` +
    (next
      ? next.limits.importRowsPerMonth === null
        ? ` ${next.label} includes custom import volume.`
        : ` ${next.label} includes ${fmtInt(next.limits.importRowsPerMonth)} rows/month.`
      : "");
  return { allowed: false, limit, used, requested, remaining, message, upgradeTo };
}

/* ───────────────────────────── feature gates ──────────────────────────── */

export type Feature = keyof TierFeatures;

export type FeatureCheck =
  | { allowed: true; feature: Feature; tier: Tier }
  | { allowed: false; denied: true; feature: Feature; tier: Tier; reason: string; upgradeTo: PaidTier | null };

export const FEATURE_LABEL: Record<Feature, string> = {
  quoteToCash: "Quote-to-cash (proposal → e-sign → checklist → deal room → invoice → notify → pay → filed)",
  freePrimitives: "Forms, tables, dashboards and the knowledge base",
  approvalsQueue: "The approval queue",
  controlPlane: "The automation control plane (autonomy allow-lists, kill switch, error budget)",
  dpa: "A data-processing agreement",
  sso: "SSO/SAML sign-in",
  apiAdapters: "Provider API adapters",
};

/** Pure feature decision. Never throws; always says which tier would lift it. */
export function checkFeature(ent: Entitlement, feature: Feature): FeatureCheck {
  if (!(feature in ent.features)) {
    return { allowed: false, denied: true, feature, tier: ent.tier, reason: `Unknown feature "${String(feature)}"`, upgradeTo: null };
  }
  if (ent.features[feature]) return { allowed: true, feature, tier: ent.tier };
  // A tenant with no plan is not denied a paid feature — there is nothing to
  // enforce yet. Say that plainly instead of pretending they are Starter.
  const upgradeTo: PaidTier | null = (() => {
    for (const t of PAID_TIERS) if (TIER_SPECS[t].features[feature]) return t;
    return null;
  })();
  const reason = ent.enforce
    ? `${FEATURE_LABEL[feature]} is included from ${upgradeTo ? TIER_SPECS[upgradeTo].label : "a higher tier"} — your ${ent.label} plan does not include it.`
    : `${FEATURE_LABEL[feature]} needs a plan.`;
  return { allowed: false, denied: true, feature, tier: ent.tier, reason, upgradeTo };
}

/* ───────────────────────────── presentation ───────────────────────────── */

export type LimitEnforcement = "enforced" | "stated" | "not-built";

export interface LimitRow {
  label: string;
  value: string;
  /** "enforced" = a gate refuses past it; "stated" = included, not gated yet. */
  status: LimitEnforcement;
}

/**
 * The rows the billing page (and the pricing page) render. ONE source: these
 * strings are generated from TIER_SPECS, so a page can never promise more than
 * the gate allows — and a limit the page states but no gate enforces is
 * labelled `stated`, never dressed up as enforced.
 */
export function describeEntitlement(ent: Entitlement): { rows: LimitRow[]; notes: string[] } {
  const rows: LimitRow[] = [];
  const notes: string[] = [];
  const spec = specForTier(ent.tier);

  if (!spec) {
    rows.push({ label: "Plan", value: "No plan on file", status: "stated" });
    notes.push("Forms, tables, dashboards and the knowledge base are open without a plan.");
    return { rows, notes };
  }

  rows.push({ label: "Plan", value: `${spec.label} — $${spec.monthlyUsd}/mo`, status: "stated" });
  rows.push({
    label: "Seats",
    value: spec.limits.seats === null ? "Unlimited" : String(spec.limits.seats),
    status: "stated",
  });
  rows.push({
    label: "Imported rows per month",
    value:
      spec.limits.importRowsPerMonth === null
        ? "Custom volume"
        : `${fmtInt(spec.limits.importRowsPerMonth)} rows/month`,
    status: "enforced",
  });
  rows.push({
    label: "Audit retention",
    value: spec.limits.auditRetentionDays === null ? "Configurable" : `${spec.limits.auditRetentionDays} days`,
    status: "stated",
  });
  rows.push({
    label: "Audit export",
    value: spec.limits.auditExport ? "Included" : "Not included",
    status: "stated",
  });
  rows.push({
    label: "Automation control plane",
    value: spec.features.controlPlane
      ? "Included — autonomy allow-lists, kill switch, error budget"
      : "Included from Growth",
    status: "enforced",
  });
  rows.push({
    label: "Provider API adapters",
    value: !spec.features.apiAdapters
      ? "Not included"
      : spec.limits.apiAdapters === null
        ? "All adapters"
        : `${spec.limits.apiAdapters} adapters`,
    status: "not-built",
  });
  rows.push({
    label: "Data-processing agreement",
    value: spec.features.dpa ? "Included" : "Included from Growth",
    status: "stated",
  });
  rows.push({ label: "SSO/SAML", value: spec.features.sso ? "Included" : "Included from Enterprise", status: "stated" });
  rows.push({ label: "Support", value: spec.support, status: "stated" });
  rows.push({ label: "Onboarding", value: spec.onboarding, status: "stated" });

  notes.push("The full quote-to-cash chain — proposal, e-sign, checklist, deal room, invoice, notify, pay, filed — is included in every plan.");
  notes.push("Forms, tables, dashboards and the knowledge base are open to every tier, including accounts with no plan.");
  if (spec.limits.apiAdapters !== null && spec.features.apiAdapters) {
    notes.push("Provider API adapters are not built yet — the adapter count above is what your plan will include, not a capability live today.");
  }
  if (ent.uncertain) notes.push(ent.note);
  return { rows, notes };
}

/** One-line tier + limit summary used in refusals and cards. */
export function tierSummary(ent: Entitlement): string {
  const spec = specForTier(ent.tier);
  if (!spec) return "No plan on file";
  const rows = spec.limits.importRowsPerMonth === null ? "custom import volume" : `${fmtInt(spec.limits.importRowsPerMonth)} imported rows/month`;
  return `${spec.label} — ${rows}`;
}
