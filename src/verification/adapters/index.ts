/**
 * Verification adapter registry.
 *
 * Maps a provider id to a live verification function that exercises a capability
 * contract against the provider's canonical API host. Providers without an entry
 * are reported as "unverified — no adapter" by the batch runner (no network call).
 */
import type { CapabilityContract } from "../../lib/capability-contract";
import type { ProviderCredential } from "../credential-source";
import { xeroAdapter } from "./xero";
import { googleAdapter } from "./google";
import { microsoftAdapter } from "./microsoft";
import { quickbooksAdapter } from "./quickbooks";
import { anaplanAdapter, coupaAdapter, docusignAdapter, hubspotAdapter, intercomAdapter, jiraAdapter, marketoAdapter, mondayComAdapter, onfleetAdapter, salesforceAdapter, servicenowAdapter, shopifyAdapter, slackAdapter, tableauAdapter, workdayAdapter, zendeskAdapter } from "./priority";

export interface AdapterContext {
  credentials: ProviderCredential;
  app?: { clientId?: string; clientSecret?: string };
  /** When false, automate (write) contracts fail closed instead of mutating live data. */
  allowWrites: boolean;
}

export type CapabilityAdapter = (
  contract: CapabilityContract,
  ctx: AdapterContext,
) => Promise<{ httpStatus?: number; response?: unknown }>;

/** Provider id → adapter. Phase 7 priority providers (free sandbox tier) are wired. */
export const adapterRegistry: Record<string, CapabilityAdapter | undefined> = {
  xero: xeroAdapter,
  hubspot: hubspotAdapter,
  slack: slackAdapter,
  jira: jiraAdapter,
  docusign: docusignAdapter,
  "monday-com": mondayComAdapter,
  // Capability contracts reference Monday.com as providerId "monday" (MONDAY_PROVIDER_ID in
  // src/agents/capabilities/operations.ts) while the provider module id is "monday-com".
  monday: mondayComAdapter,
  // QuickBooks Online (capability contracts use providerId "quickbooks"; module id is
  // "quickbooks-online" — both map to the same fail-closed live adapter).
  quickbooks: quickbooksAdapter,
  "quickbooks-online": quickbooksAdapter,
  intercom: intercomAdapter,
  salesforce: salesforceAdapter,
  zendesk: zendeskAdapter,
  workday: workdayAdapter,
  servicenow: servicenowAdapter,
  tableau: tableauAdapter,
  onfleet: onfleetAdapter,
  shopify: shopifyAdapter,
  marketo: marketoAdapter,
  coupa: coupaAdapter,
  anaplan: anaplanAdapter,
  // Google Productivity (Google Workspace file types + Calendar)
  "google-drive": googleAdapter,
  "google-docs": googleAdapter,
  "google-sheets": googleAdapter,
  "google-slides": googleAdapter,
  "google-calendar": googleAdapter,
  // Microsoft Productivity (Office file types + OneDrive)
  onedrive: microsoftAdapter,
  "microsoft-word": microsoftAdapter,
  "microsoft-excel": microsoftAdapter,
  "microsoft-powerpoint": microsoftAdapter,
};

export function hasAdapter(providerId: string): boolean {
  return Boolean(adapterRegistry[providerId]);
}
