/**
 * Provider placeholder catalog.
 *
 * Providers we have code for — an inbound import lane or an adapter client in
 * src/integrations/providers/<id>/ — get a normal card in the portal
 * integrations UI, badged for the lane rather than for availability: no tenant
 * has ever connected a provider, so nothing here is connected or verified.
 * Every other provider in the registry renders an honest placeholder card:
 *   "In development — we're working on it." + contact line.
 *
 * Truthfulness rules (owner-specified):
 *  - "Connected" must NEVER appear for a placeholder provider.
 *  - Salesforce has app credentials but NO customer connection → placeholder.
 *  - The contact email is owner-specified (lowercase): electric.vortexz@gmail.com.
 *
 * Matching is done on canonical provider ids (see provider-canonical.ts) so
 * aliases (gmail→google-workspace, word→microsoft-word, …) resolve correctly.
 */

export const PLACEHOLDER_CONTACT_EMAIL = "electric.vortexz@gmail.com";
export const PLACEHOLDER_STATUS_COPY = "In development — we're working on it.";
export const PLACEHOLDER_CONTACT_COPY = `Want it sooner? Contact us at ${PLACEHOLDER_CONTACT_EMAIL}`;

/**
 * Providers this codebase has code for. Canonical ids. Membership means a lane
 * exists to write against — an inbound import lane under src/native/import/ or a
 * client under src/integrations/providers/<id>/ — NOT that it is connected,
 * verified or live. No integration in this product has ever carried a real
 * tenant record.
 */
export const REAL_INTEGRATION_PROVIDERS: ReadonlySet<string> = new Set([
  // Slack
  "slack",
  // Google productivity suite
  "google-docs",
  "google-sheets",
  "google-drive",
  "google-slides",
  "google-calendar",
  // Microsoft Office + OneDrive
  "microsoft-word",
  "microsoft-excel",
  "microsoft-powerpoint",
  "onedrive",
  // Accounting / CRM / e-sign / email / payments
  "xero",
  "hubspot",
  "docusign",
  "sendgrid",
  "stripe",
]);

/**
 * True when a provider id has no real connected credentials and should render
 * as an in-development placeholder. Unknown ids FAIL OPEN to placeholder
 * (never claim a provider is live when we have no verified connection).
 */
export function isPlaceholderProvider(providerId: string): boolean {
  if (!providerId) return true;
  return !REAL_INTEGRATION_PROVIDERS.has(providerId.toLowerCase());
}

/** Filter a catalog list down to placeholder providers (for tests/rendering). */
export function getPlaceholderProviders<T extends { id: string }>(providers: T[]): T[] {
  return providers.filter((p) => isPlaceholderProvider(p.id));
}

/** Filter a catalog list down to real (non-placeholder) providers. */
export function getRealProviders<T extends { id: string }>(providers: T[]): T[] {
  return providers.filter((p) => !isPlaceholderProvider(p.id));
}
