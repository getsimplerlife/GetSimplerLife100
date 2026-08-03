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
import { docusignAdapter, hubspotAdapter, intercomAdapter, jiraAdapter, mondayComAdapter, onfleetAdapter, salesforceAdapter, servicenowAdapter, shopifyAdapter, slackAdapter, tableauAdapter, workdayAdapter, zendeskAdapter } from "./priority";

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
  intercom: intercomAdapter,
  salesforce: salesforceAdapter,
  zendesk: zendeskAdapter,
  workday: workdayAdapter,
  servicenow: servicenowAdapter,
  tableau: tableauAdapter,
  onfleet: onfleetAdapter,
  shopify: shopifyAdapter,
};

export function hasAdapter(providerId: string): boolean {
  return Boolean(adapterRegistry[providerId]);
}
