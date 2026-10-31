/**
 * native/invoice/webhook-token.ts — the per-tenant webhook PATH token
 * (slice 155).
 *
 * THE PROBLEM THIS SOLVES. Stripe signs a webhook with a secret that belongs to
 * one ENDPOINT in one tenant's dashboard. A single shared platform URL would
 * have to try every tenant's secret against every request, and it could not
 * tell which tenant's books a payment belongs to before it verified. So the URL
 * itself carries the tenant.
 *
 * WHAT THE TOKEN IS, AND IS NOT. It is an IDENTIFIER, not an authenticator: it
 * says "this request is addressed to tenant X". It proves nothing about who
 * sent the request. The AUTHENTICATOR is the signature, checked against tenant
 * X's own stored endpoint secret, on the raw bytes, in constant time. That is
 * why an unknown token can safely answer a plain 404 — knowing a token buys an
 * attacker nothing but the ability to be rejected by a signature check.
 *
 * PROPERTIES (each is a decision, not a default):
 *   - 32 random bytes, base64url (43 chars) — not enumerable, no tenant data
 *     inside it, no timestamp to correlate;
 *   - STABLE: it survives a disconnect and a fresh connect, because the URL is
 *     already pasted into the tenant's Stripe dashboard and silently changing
 *     it would break their endpoint without telling them;
 *   - replaced ONLY by an explicit rotate action, which is audited;
 *   - lookups compare SHA-256 digests in constant time, so the endpoint reveals
 *     nothing about which token it *almost* matched.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readJSON, writeJSON, resolveDataDir } from "../../lib/data-store";
import { appendAudit } from "./store";
import { NATIVE_INVOICE_WEBHOOK_TOKENS_KEY } from "./types";

/** 32 random bytes → 43 base64url characters. */
const TOKEN_BYTES = 32;
/** Exactly what we mint — anything else is rejected before a single lookup. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

interface WebhookTokenRecord {
  tenantId: string;
  token: string;
  createdAt: string;
  createdBy: string;
  rotatedAt?: string;
}

type WebhookTokenStore = Record<string, WebhookTokenRecord>;

function dataPath(dataDir: string): string {
  return `${resolveDataDir(dataDir, process.cwd())}/${NATIVE_INVOICE_WEBHOOK_TOKENS_KEY}`;
}
function loadAll(dataDir: string): WebhookTokenStore {
  try {
    const raw = readJSON(dataPath(dataDir));
    return raw && typeof raw === "object" ? (raw as WebhookTokenStore) : {};
  } catch {
    return {};
  }
}
function saveAll(dataDir: string, all: WebhookTokenStore): void {
  writeJSON(dataPath(dataDir), all);
}
function digest(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}
function mintToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** True only for a token shaped exactly like one we mint. */
export function isWebhookTokenShape(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/**
 * The tenant's webhook token, minted on first use. Idempotent: a second call
 * returns the SAME token, so the URL a tenant pasted into their dashboard keeps
 * working. This is a read-path convenience, not a rotation.
 */
export function getOrCreateTenantWebhookToken(dataDir: string, tenantId: string): string {
  const all = loadAll(dataDir);
  const existing = all[tenantId];
  if (existing && isWebhookTokenShape(existing.token)) return existing.token;
  const now = new Date().toISOString();
  const record: WebhookTokenRecord = { tenantId, token: mintToken(), createdAt: now, createdBy: tenantId };
  all[tenantId] = record;
  saveAll(dataDir, all);
  appendAudit(dataDir, {
    tenantId,
    actor: tenantId,
    action: "native.invoice.stripe.webhook.address.issued",
    invoiceId: "",
    detail:
      "Issued this workspace's own payment webhook address — the tenant pastes it into their Stripe dashboard and the address stays the same until it is explicitly replaced",
  });
  return record.token;
}

/**
 * Replace the token (explicit action only). The previous URL stops resolving
 * the instant this returns: an unknown token is a 404 with no effect. Audited,
 * and the audit carries no token value — the URL is a bearer-ish address and
 * does not belong in a log.
 */
export function rotateTenantWebhookToken(
  dataDir: string,
  tenantId: string,
  actor: string,
): { ok: true; token: string } | { ok: false; error: string } {
  if (!tenantId?.trim() || !actor?.trim()) return { ok: false, error: "tenantId and actor are required" };
  const all = loadAll(dataDir);
  const existing = all[tenantId];
  const now = new Date().toISOString();
  all[tenantId] = {
    tenantId,
    token: mintToken(),
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? actor,
    rotatedAt: now,
  };
  saveAll(dataDir, all);
  appendAudit(dataDir, {
    tenantId,
    actor,
    action: "native.invoice.stripe.webhook.address.rotated",
    invoiceId: "",
    detail: existing
      ? "Replaced this workspace's payment webhook address — the previous address no longer resolves, so the new one must be pasted into the Stripe dashboard"
      : "Issued this workspace's first payment webhook address",
  });
  return { ok: true, token: all[tenantId].token };
}

/**
 * Resolve the tenant a path token addresses, or null. Shape first (so junk never
 * reaches the store), then a constant-time digest comparison over every stored
 * token — the loop does not exit early, so timing does not depend on where (or
 * whether) a match sat.
 */
export function lookupTenantByWebhookToken(dataDir: string, token: unknown): string | null {
  if (!isWebhookTokenShape(token)) return null;
  const wanted = digest(token);
  const all = loadAll(dataDir);
  let found: string | null = null;
  for (const record of Object.values(all)) {
    if (!record || typeof record.token !== "string") continue;
    const candidate = digest(record.token);
    if (candidate.length === wanted.length && timingSafeEqual(candidate, wanted) && !found) {
      found = record.tenantId;
    }
  }
  return found;
}

/** Path (not URL) the tenant pastes into their Stripe dashboard, minus origin. */
export function invoiceWebhookPath(token: string): string {
  return `/api/native/invoice/webhook/stripe/${token}`;
}
