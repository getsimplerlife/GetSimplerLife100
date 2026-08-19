/**
 * connected-accounts.ts — build the REAL "connected accounts" list for the
 * portal from the authoritative OAuth credential store (tenant_oauth_credentials.json),
 * NOT from the legacy tenant_integrations.json (whose only keys are stale
 * fixtures, so the owner's 13 real connections showed as "0 connected").
 *
 * The authoritative store is keyed `${email}:${providerId}`. We:
 *   1. iterate every entry, keeping ONLY entries scoped to the requesting email
 *      (strict per-tenant isolation — never leak another tenant's row);
 *   2. keep only entries that actually hold a token (genuinely connected);
 *   3. enrich from the provider catalog (src/content/integrations.ts) for a
 *      display name / icon / category; providers not in the catalog (slack,
 *      onedrive, docusign) get a humanized fallback;
 *   4. overlay the live #230 health snapshot so a dead credential shows
 *      "Degraded"/"Reconnect Required" instead of a stale "Connected".
 *
 * Used by BOTH /api/data/connected-accounts and /api/integrations (GET) so the
 * dashboard "integrations connected" count reflects the same truth.
 */
import { join } from "path";
import { readJSON } from "./data-store";
import { applyHealthToConnections, connectionHealthSnapshot } from "./connection-health";
import { integrations } from "../content/integrations";

/** Providers that live outside the catalog but are real, verified OAuth flows. */
const EXTRA_LABELS: Record<string, { name: string; icon: string; category: string }> = {
  slack: { name: "Slack", icon: "💬", category: "Communication" },
  onedrive: { name: "OneDrive", icon: "☁️", category: "Data" },
  docusign: { name: "DocuSign", icon: "✍️", category: "" },
};

const CATALOG: Record<string, { name: string; icon: string; category: string }> = {};
for (const i of integrations) {
  if (!i || !i.id) continue;
  CATALOG[i.id] = { name: i.name, icon: i.icon, category: i.category };
}

function humanize(id: string): string {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Enriched connection object the Connected Accounts page + dashboard consume. */
export interface ConnectedAccount {
  id: string;
  provider: string;
  providerId: string;
  name: string;
  category: string;
  status: string;
  connectedAt: string | null;
  icon: string;
  _provider: { name: string; icon: string; category: string };
}

export function buildConnectedAccountsFromCredentials(
  email: string,
  dataDir: string,
): ConnectedAccount[] {
  const tokenData =
    (readJSON(join(dataDir, "tenant_oauth_credentials.json")) as Record<string, any>) || {};
  const conns: ConnectedAccount[] = [];
  for (const [key, entry] of Object.entries<any>(tokenData)) {
    if (!entry || typeof entry !== "object") continue;
    const provider = String(
      entry.provider || (key.includes(":") ? key.split(":")[1] : key),
    );
    const entryEmail = key.includes(":")
      ? key.split(":")[0]
      : String(entry.email || "");
    // Require an email-scoped key AND exact match — fail closed on anything else.
    if (!entryEmail || entryEmail !== email) continue;
    // Only genuinely connected entries surface on the page.
    if (!(entry.accessToken || entry.apiToken)) continue;
    const meta = CATALOG[provider] || EXTRA_LABELS[provider] || {};
    const name = meta.name || humanize(provider);
    const icon = meta.icon || "🔌";
    const category = meta.category || "";
    conns.push({
      id: `${email}:${provider}`,
      provider,
      providerId: provider,
      name,
      category,
      status: "Connected",
      connectedAt: entry.updatedAt || entry.connectedAt || null,
      icon,
      _provider: { name, icon, category },
    });
  }
  // Overlay live health: degraded / reconnect_required truth, never a stale badge.
  return applyHealthToConnections(conns, connectionHealthSnapshot(dataDir), email) as ConnectedAccount[];
}
