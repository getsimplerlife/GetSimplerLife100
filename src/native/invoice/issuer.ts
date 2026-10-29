/**
 * native/invoice/issuer.ts — the CUSTOMER-FACING issuer display name.
 *
 * Three surfaces of this slice are read by the CUSTOMER (no login at all):
 * the public signed-slug page, the invoice PDF, and the delivery email. All
 * three may carry a HUMAN display name and nothing else. They must never
 * carry:
 *   - the tenant id — the workspace ACCOUNT identifier (its email address),
 *   - any entity id (inv_/dea_/doc_/ipw_/bkt_),
 *   - a blank, email-shaped or absurdly long string.
 *
 * Source of the display name: the ONE settings store (tenant_settings.json),
 * field `companyName` — the same field the portal's Brand & Profile section
 * captures (src/lazy/portal.settings.index.page.tsx). Nothing new is stored
 * here and no second settings file is introduced.
 *
 * When no usable display name is configured the fallback is a neutral HUMAN
 * label — never the tenant id, never an id. The resolver is fail-closed by
 * construction: it can only ever return a vetted display name or
 * NEUTRAL_ISSUER_LABEL.
 */
import { getTenantSettings } from "../../lib/tenant-settings";

/** Neutral human label used when the workspace has no display name. */
export const NEUTRAL_ISSUER_LABEL = "Your supplier";

/** A display name is a short label — anything longer is not a name. */
export const MAX_ISSUER_NAME = 120;

/** Entity-id shapes that must never reach a customer-facing surface. */
const ENTITY_ID_RE = /(?:^|[^A-Za-z0-9])(?:inv|dea|doc|ipw|bkt)_[A-Za-z0-9_-]+/;

/**
 * True when a candidate string is safe to show to a customer: a real, short,
 * human label that is neither an entity id nor an account identifier.
 */
export function isCustomerSafeName(candidate: unknown): candidate is string {
  if (typeof candidate !== "string") return false;
  const v = candidate.trim();
  if (!v || v.length > MAX_ISSUER_NAME) return false;
  if (ENTITY_ID_RE.test(v)) return false;
  // An email address is an account identifier, not a display name.
  if (v.includes("@")) return false;
  return true;
}

/** Pull the configured company name out of a settings entry (both known shapes). */
function pickCompanyName(entry: Record<string, unknown>): string {
  const direct = entry.companyName;
  if (typeof direct === "string" && direct.trim()) return direct;
  // The portal settings page also reads a `{ items: [{ key, value }] }` list
  // shape — honour it so a workspace that saved through that UI still resolves.
  const items = entry.items;
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const row = it as Record<string, unknown>;
      if (row.key === "companyName" && typeof row.value === "string" && row.value.trim()) return row.value;
    }
  }
  return "";
}

/**
 * The issuer label for every customer-facing surface of one invoice.
 * NEVER returns the tenant id and NEVER returns an entity id.
 */
export function resolveIssuerDisplayName(tenantId: string, dataDir?: string): string {
  const raw = getTenantSettings(tenantId, dataDir) as unknown;
  const entry = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const candidate = pickCompanyName(entry).trim();
  if (!candidate) return NEUTRAL_ISSUER_LABEL;
  // Belt and braces: a configured value that IS the account identifier is not
  // a display name — never echo it back to the customer.
  if (tenantId && candidate.toLowerCase() === tenantId.trim().toLowerCase()) return NEUTRAL_ISSUER_LABEL;
  if (!isCustomerSafeName(candidate)) return NEUTRAL_ISSUER_LABEL;
  return candidate;
}
