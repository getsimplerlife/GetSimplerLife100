/**
 * Provider id canonicalization.
 *
 * Some public/legacy provider ids differ from the canonical module + credential
 * ids used by `src/integrations/providers/<id>/`, the capability contracts, the
 * verification adapters, the token-refresher registry, and the OAuth credential
 * env vars (`OAUTH_<PROVIDER>_CLIENT_ID`).
 *
 * Every OAuth path that resolves credentials, imports an auth module, or
 * persists tenant tokens MUST go through `getCanonicalProvider()` so the stored
 * token key (`${email}:${provider}`) and env key match what the rest of the
 * system expects. Unknown ids fail closed: they canonicalize to themselves.
 *
 * Microsoft Office aliases: the portal catalog used to advertise bare `word` /
 * `excel` ids while the auth modules, capability contracts, verification
 * adapters, and refresh registry all use `microsoft-word` / `microsoft-excel` /
 * `microsoft-powerpoint`. The catalog now ships the canonical ids; these alias
 * mappings keep old deep links / in-flight state working.
 */
export const PROVIDER_CANONICAL: Record<string, string> = {
  "quickbooks-online": "quickbooks-enterprise",
  "quickbooks": "quickbooks-enterprise",
  "quickbooks-desktop": "quickbooks-enterprise",
  "zoho": "zoho-crm",
  "gmail": "google-workspace",
  "google": "google-workspace",
  "microsoft": "microsoft-365",
  "microsoft-dynamics": "dynamics-365",
  "outlook": "outlook-calendar",
  "bamboohr": "adp",
  "sap": "sap-s4hana",
  // Microsoft Office aliases → canonical module/credential ids
  "word": "microsoft-word",
  "excel": "microsoft-excel",
  "powerpoint": "microsoft-powerpoint",
};

export function getCanonicalProvider(provider: string): string {
  return PROVIDER_CANONICAL[provider.toLowerCase()] || provider.toLowerCase();
}
