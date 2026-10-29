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
}

/** What ANY client is allowed to see about a tenant's Stripe connection. */
export interface StripeConnectStatus {
  connected: boolean;
  /** Masked hint (last 4) or null when not connected. NEVER the key. */
  hint: string | null;
  keyMode: "live" | "test" | null;
  addedAt: string | null;
}

export const NOT_CONNECTED: StripeConnectStatus = {
  connected: false,
  hint: null,
  keyMode: null,
  addedAt: null,
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
 * Store the tenant's Stripe key (encrypted) and audit the connection.
 * Validation FIRST: an invalid key writes nothing and audits nothing.
 * The key itself never appears in the returned status or the audit detail.
 */
export function connectTenantStripe(
  dataDir: string,
  tenantId: string,
  actor: string,
  rawKey: unknown,
): { ok: true; status: StripeConnectStatus } | { ok: false; error: string } {
  if (!tenantId?.trim() || !actor?.trim()) return { ok: false, error: "tenantId and actor are required" };
  const v = validateStripeSecretKey(rawKey);
  if (!v.ok) return { ok: false, error: v.error };
  const now = new Date().toISOString();
  const record: StripeConnectRecord = {
    tenantId,
    encryptedKey: encryptSecret(v.value),
    hint: maskStripeKey(v.value),
    keyMode: v.mode,
    addedAt: now,
    addedBy: actor,
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
  return { ok: true, status: toStatus(record) };
}

/**
 * Revoke the tenant's Stripe connection (deletes exactly that tenant's record).
 * Returns false when nothing was connected (idempotent, still audited only on
 * a real change).
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
    detail: `Disconnected the Stripe key (${existing.hint}) — online payment on this workspace's invoices stops immediately; invoices fall back to "payment is arranged with the issuer"`,
  });
  return true;
}

function toStatus(record: StripeConnectRecord): StripeConnectStatus {
  return { connected: true, hint: record.hint, keyMode: record.keyMode, addedAt: record.addedAt };
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
