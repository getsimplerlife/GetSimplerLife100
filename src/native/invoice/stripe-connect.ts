/**
 * native/invoice/stripe-connect.ts — the TENANT'S OWN Stripe account, as a
 * per-tenant credential lane (slice 134).
 *
 * OWNER DECISION (2026-10-29): a tenant connects THEIR OWN Stripe account so
 * their customers pay THEM. We never hold, collect, route or remit a tenant's
 * customer money — no money transmission, no licensing exposure. The platform's
 * own Stripe account (the three subscription tiers) is NOT referenced here and
 * must never be touched by this lane.
 *
 * Storage contract (the documented house credential lane):
 *   - file `<dataDir>/native_stripe_connect.json`, shape
 *       { [tenantId]: { encryptedKey, hint, keyMode, addedAt, addedBy } }
 *     — a structural tenant map, so a lookup can only ever resolve the exact
 *     tenant's own record (absent means absent → fail-closed, never another
 *     tenant's key),
 *   - `encryptedKey` is AES-256-GCM (`iv:tag:ciphertext`, hex) using the SAME
 *     key material as the rest of the credential lanes
 *     (INTEGRATION_ENCRYPTION_KEY, see native/transport/store.ts encryptSecret)
 *     — never plaintext at rest,
 *   - the plaintext key is NEVER returned to any client: the only thing that
 *     ever leaves this module is `{ connected, hint, keyMode, addedAt }`, where
 *     `hint` is a mask of the last 4 characters (identification only),
 *   - the key is NEVER written to an audit line, an event, a log line or an
 *     error message — every audit detail built here is derived from the mask,
 *   - disconnect deletes exactly that tenant's record (revocable; no sweep).
 *
 * Validation happens BEFORE anything is stored (a malformed / publishable key
 * is rejected with a 400 and nothing is written, audited or sent anywhere).
 * Only a Stripe SECRET or RESTRICTED key can create a Checkout Session on the
 * tenant's account, so publishable (`pk_`) keys are refused explicitly.
 *
 * SLICE 155 — the endpoint signing secret. The same record also carries the
 * tenant's own webhook ENDPOINT signing secret (`whsec_…`, pasted from their
 * dashboard), encrypted with the same AES-256-GCM path. It is an AUTHENTICATOR,
 * not an identifier, so the client-safe status exposes exactly one fact about
 * it — `hasWebhookSecret: boolean` — with no value, no prefix, no hint and no
 * length, and no audit line or log line ever contains it. Disconnecting removes
 * both secrets at once.
 */
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import { encryptSecret, decryptSecret } from "../transport/store";
import { appendAudit } from "./store";

/** Durable store key for the per-tenant Stripe connection records. */
export const NATIVE_STRIPE_CONNECT_KEY = "native_stripe_connect.json";

/** Cap on the accepted key length (Stripe keys are ~100 chars; hard stop). */
const MAX_KEY_LENGTH = 200;
/** Minimum body length after the mode prefix (defensive, not a format oracle). */
const MIN_KEY_BODY = 10;

/** One tenant's connection record — as persisted (contains the ciphertext). */
interface StripeConnectRecord {
  tenantId: string;
  /** AES-256-GCM `iv:tag:ciphertext` (hex) — never plaintext. */
  encryptedKey: string;
  /** Masked hint for the UI: `•••• ` + the last 4 characters of the key. */
  hint: string;
  /** Which Stripe mode the key belongs to — derived from the prefix only. */
  keyMode: "live" | "test";
  addedAt: string;
  addedBy: string;
  /**
   * SLICE 155 — the tenant's own webhook ENDPOINT signing secret (`whsec_…`),
   * AES-256-GCM encrypted with the same key material as the API key. Optional:
   * a tenant can connect their account before they create the endpoint in
   * their dashboard. It is an AUTHENTICATOR, so it is never returned, never
   * masked into a hint, never audited and never logged.
   */
  encryptedWebhookSecret?: string;
  webhookSecretAddedAt?: string;
}

/** What ANY client is allowed to see about a tenant's Stripe connection. */
export interface StripeConnectStatus {
  connected: boolean;
  /** Masked hint (last 4) or null when not connected. NEVER the key. */
  hint: string | null;
  keyMode: "live" | "test" | null;
  addedAt: string | null;
  /**
   * Whether an endpoint signing secret is on file — a boolean, never the value,
   * never a prefix, never a length. Without it the webhook endpoint cannot
   * verify anything, so this is the one fact the tenant needs to act on.
   */
  hasWebhookSecret: boolean;
}

export const NOT_CONNECTED: StripeConnectStatus = {
  connected: false,
  hint: null,
  keyMode: null,
  addedAt: null,
  hasWebhookSecret: false,
};

function dataPath(dataDir: string, key: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${key}`;
}
function loadAll(dataDir: string): Record<string, StripeConnectRecord> {
  try {
    const raw = readJSON(dataPath(dataDir, NATIVE_STRIPE_CONNECT_KEY));
    return raw && typeof raw === "object" ? (raw as Record<string, StripeConnectRecord>) : {};
  } catch {
    return {};
  }
}
function saveAll(dataDir: string, all: Record<string, StripeConnectRecord>): void {
  writeJSON(dataPath(dataDir, NATIVE_STRIPE_CONNECT_KEY), all);
}

/** Mask a key for display/audit: never more than the last 4 characters. */
export function maskStripeKey(key: string): string {
  const tail = key.slice(-4);
  return `•••• ${tail}`;
}

/**
 * Validate a pasted Stripe key BEFORE it is stored.
 *
 * Accepts a SECRET (`sk_`) or RESTRICTED (`rk_`) key in live or test mode.
 * Refuses everything else — including a publishable `pk_` key, which cannot
 * create a Checkout Session on the tenant's account, and any key whose shape
 * is not a Stripe secret key (no format oracle: the error text never echoes
 * the submitted value).
 */
export function validateStripeSecretKey(raw: unknown): { ok: true; value: string; mode: "live" | "test" } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Paste your Stripe secret key." };
  const value = raw.trim();
  if (!value) return { ok: false, error: "Paste your Stripe secret key." };
  if (value.length > MAX_KEY_LENGTH) {
    return { ok: false, error: "That does not look like a Stripe secret key (too long)." };
  }
  if (/^pk_/.test(value)) {
    return {
      ok: false,
      error: "That is a publishable key. Use your Stripe secret or restricted key (it starts with sk_ or rk_).",
    };
  }
  // `(sk|rk)_(live|test)_` — secret / restricted, live or test mode.
  const m = /^(sk|rk)_(live|test)_([A-Za-z0-9]{10,})$/.exec(value);
  if (!m || m[3].length < MIN_KEY_BODY) {
    return {
      ok: false,
      error: "That does not look like a Stripe secret key. It should start with sk_ or rk_, followed by live_ or test_.",
    };
  }
  return { ok: true, value, mode: m[2] as "live" | "test" };
}

/**
 * Validate a pasted webhook ENDPOINT signing secret BEFORE it is stored
 * (slice 155). Stripe issues these per endpoint in the tenant's own dashboard;
 * the shape is `whsec_` followed by base64-ish characters.
 *
 * The error text never echoes the submitted value and never says how far it
 * got — a wrong secret is indistinguishable from a malformed one to the caller.
 */
export function validateStripeWebhookSecret(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof raw !== "string") return { ok: false, error: "Paste the signing secret for your webhook endpoint." };
  const value = raw.trim();
  if (!value) return { ok: false, error: "Paste the signing secret for your webhook endpoint." };
  if (value.length > MAX_KEY_LENGTH) {
    return { ok: false, error: "That does not look like a webhook signing secret (too long)." };
  }
  if (!/^whsec_[A-Za-z0-9+/=_]{10,}$/.test(value)) {
    return {
      ok: false,
      error: "That does not look like a webhook signing secret. It should start with whsec_.",
    };
  }
  return { ok: true, value };
}

/**
 * Store the tenant's Stripe key (encrypted) and audit the connection.
 * Validation FIRST: an invalid key writes nothing and audits nothing.
 * The key itself never appears in the returned status or the audit detail.
 *
 * SLICE 155: an endpoint signing secret may be supplied in the same call (the
 * tenant pastes both from their dashboard). It is validated before ANYTHING is
 * written, so a bad secret cannot leave a half-connected account behind.
 */
export function connectTenantStripe(
  dataDir: string,
  tenantId: string,
  actor: string,
  rawKey: unknown,
  rawWebhookSecret?: unknown,
): { ok: true; status: StripeConnectStatus } | { ok: false; error: string } {
  if (!tenantId?.trim() || !actor?.trim()) return { ok: false, error: "tenantId and actor are required" };
  const v = validateStripeSecretKey(rawKey);
  if (!v.ok) return { ok: false, error: v.error };
  let webhookSecret: string | undefined;
  if (rawWebhookSecret !== undefined && rawWebhookSecret !== null && rawWebhookSecret !== "") {
    const w = validateStripeWebhookSecret(rawWebhookSecret);
    if (!w.ok) return { ok: false, error: w.error };
    webhookSecret = w.value;
  }
  const now = new Date().toISOString();
  const record: StripeConnectRecord = {
    tenantId,
    encryptedKey: encryptSecret(v.value),
    hint: maskStripeKey(v.value),
    keyMode: v.mode,
    addedAt: now,
    addedBy: actor,
    ...(webhookSecret ? { encryptedWebhookSecret: encryptSecret(webhookSecret), webhookSecretAddedAt: now } : {}),
  };
  const all = loadAll(dataDir);
  all[tenantId] = record;
  saveAll(dataDir, all);
  // Audit carries the MASK only — never the key, never a prefix.
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.invoice.stripe.connected",
    invoiceId: "",
    detail: `Connected a Stripe ${v.mode}-mode secret key (${record.hint}) — invoice payments from this workspace settle into the workspace's own Stripe account`,
  });
  if (webhookSecret) {
    // No hint, no prefix, no length — the fact of it, nothing else.
    appendAudit(dataDir, {
      tenantId,
      actor,
      action: "native.invoice.stripe.webhook.configured",
      invoiceId: "",
      detail:
        "Stored the signing secret for this workspace's own payment webhook endpoint — a payment is marked received only when a signature from that endpoint matches the invoice's own amount and currency",
    });
  }
  return { ok: true, status: toStatus(record) };
}

/**
 * Store (or replace) ONLY the webhook endpoint signing secret on an existing
 * connection (slice 155). Requires the account to be connected first: a
 * signing secret with no key behind it could never be matched to a session.
 * Validation first — a rejected secret leaves the previous one untouched.
 */
export function setTenantWebhookSecret(
  dataDir: string,
  tenantId: string,
  actor: string,
  rawWebhookSecret: unknown,
): { ok: true; status: StripeConnectStatus } | { ok: false; error: string } {
  if (!tenantId?.trim() || !actor?.trim()) return { ok: false, error: "tenantId and actor are required" };
  const all = loadAll(dataDir);
  const existing = all[tenantId];
  if (!existing) return { ok: false, error: "Connect your Stripe account first, then add the webhook signing secret." };
  const w = validateStripeWebhookSecret(rawWebhookSecret);
  if (!w.ok) return { ok: false, error: w.error };
  const now = new Date().toISOString();
  const updated: StripeConnectRecord = {
    ...existing,
    encryptedWebhookSecret: encryptSecret(w.value),
    webhookSecretAddedAt: now,
  };
  all[tenantId] = updated;
  saveAll(dataDir, all);
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.invoice.stripe.webhook.configured",
    invoiceId: "",
    detail:
      "Stored the signing secret for this workspace's own payment webhook endpoint — a payment is marked received only when a signature from that endpoint matches the invoice's own amount and currency",
  });
  return { ok: true, status: toStatus(updated) };
}

/**
 * Revoke the tenant's Stripe connection (deletes exactly that tenant's record).
 * Returns false when nothing was connected (idempotent, still audited only on
 * a real change).
 *
 * SLICE 155: the record holds BOTH secrets, so disconnecting removes the API
 * key AND the webhook signing secret in one step — there is no state in which a
 * disconnected tenant's endpoint can still verify anything. The webhook PATH
 * token is deliberately NOT deleted (it is a stable address, not a credential);
 * with no signing secret on file the endpoint answers "not configured" and
 * writes nothing.
 */
export function disconnectTenantStripe(dataDir: string, tenantId: string, actor: string): boolean {
  const all = loadAll(dataDir);
  const existing = all[tenantId];
  if (!existing) return false;
  delete all[tenantId];
  saveAll(dataDir, all);
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.invoice.stripe.disconnected",
    invoiceId: "",
    detail: `Disconnected the Stripe key (${existing.hint})${existing.encryptedWebhookSecret ? " and the payment webhook signing secret" : ""} — online payment on this workspace's invoices stops immediately; invoices fall back to "payment is arranged with the issuer"`,
  });
  return true;
}

function toStatus(record: StripeConnectRecord): StripeConnectStatus {
  return {
    connected: true,
    hint: record.hint,
    keyMode: record.keyMode,
    addedAt: record.addedAt,
    hasWebhookSecret: !!record.encryptedWebhookSecret,
  };
}

/** Client-safe status. Never contains the key or any part of it beyond the mask. */
export function getTenantStripeStatus(dataDir: string, tenantId: string): StripeConnectStatus {
  const record = loadAll(dataDir)[tenantId];
  return record ? toStatus(record) : { ...NOT_CONNECTED };
}

/**
 * INTERNAL: resolve the tenant's decrypted key for an outbound Stripe call.
 * Not exported from the module barrel and never reachable from an HTTP
 * response. Returns null when the tenant has not connected (callers MUST fail
 * closed WITHOUT any provider call in that case).
 */
export function loadTenantStripeSecret(dataDir: string, tenantId: string): { key: string; mode: "live" | "test" } | null {
  const record = loadAll(dataDir)[tenantId];
  if (!record?.encryptedKey) return null;
  try {
    const key = decryptSecret(record.encryptedKey);
    if (!key) return null;
    return { key, mode: record.keyMode };
  } catch {
    // A record that cannot be decrypted (rotated env key) is NOT usable —
    // fail closed rather than sending a garbage bearer token to Stripe.
    return null;
  }
}

/**
 * INTERNAL (slice 155): resolve the tenant's decrypted webhook ENDPOINT signing
 * secret, for local signature verification only. Not exported from the module
 * barrel and never reachable from an HTTP response. Returns null when the tenant
 * has no secret on file or it cannot be decrypted — the webhook lane then
 * refuses the request and writes nothing (fail-closed, no provider call).
 */
export function loadTenantWebhookSecret(dataDir: string, tenantId: string): string | null {
  const record = loadAll(dataDir)[tenantId];
  if (!record?.encryptedWebhookSecret) return null;
  try {
    const secret = decryptSecret(record.encryptedWebhookSecret);
    return secret || null;
  } catch {
    return null;
  }
}
