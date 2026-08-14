/**
 * provider-placeholders.test.ts — truthfulness guard for the portal
 * integrations placeholder cards.
 *
 * Rules under test (owner-specified):
 *  - Providers with real connected credentials NEVER render as placeholders.
 *  - Salesforce has app creds but NO customer connection → placeholder.
 *  - Unknown/registry ids fail OPEN to placeholder (never claim live).
 *  - The placeholder copy is exactly the owner-approved text (no fabricated
 *    statuses — "Connected" must never appear for a placeholder provider).
 */
import { describe, expect, it } from "vitest";
import {
  isPlaceholderProvider,
  getPlaceholderProviders,
  getRealProviders,
  REAL_INTEGRATION_PROVIDERS,
  PLACEHOLDER_CONTACT_EMAIL,
  PLACEHOLDER_STATUS_COPY,
  PLACEHOLDER_CONTACT_COPY,
} from "../lib/provider-placeholders";

describe("isPlaceholderProvider — connected providers never placeholder", () => {
  it("treats every real-connected provider as NOT a placeholder", () => {
    const connected = [
      "slack",
      "google-docs",
      "google-sheets",
      "google-drive",
      "google-slides",
      "google-calendar",
      "microsoft-word",
      "microsoft-excel",
      "microsoft-powerpoint",
      "onedrive",
      "xero",
      "hubspot",
      "docusign",
      "sendgrid",
      "stripe",
    ];
    for (const id of connected) {
      expect(isPlaceholderProvider(id), `${id} should NOT be a placeholder`).toBe(false);
    }
  });

  it("treats Salesforce as a placeholder (app creds, no customer connection)", () => {
    expect(isPlaceholderProvider("salesforce")).toBe(true);
  });

  it("treats common in-development providers as placeholders", () => {
    for (const id of ["jira", "zendesk", "shopify", "quickbooks", "monday", "tableau", "marketo", "anaplan"]) {
      expect(isPlaceholderProvider(id), `${id} should be a placeholder`).toBe(true);
    }
  });

  it("fails open to placeholder for unknown ids (never claims live)", () => {
    expect(isPlaceholderProvider("totally-unknown-provider")).toBe(true);
    expect(isPlaceholderProvider("")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPlaceholderProvider("Slack")).toBe(false);
    expect(isPlaceholderProvider("SALESFORCE")).toBe(true);
  });
});

describe("catalog filtering helpers", () => {
  const catalog = [
    { id: "salesforce", name: "Salesforce" },
    { id: "hubspot", name: "HubSpot" },
    { id: "slack", name: "Slack" },
    { id: "xero", name: "Xero" },
    { id: "pipedrive", name: "Pipedrive" },
    { id: "jira", name: "Jira" },
  ];
  it("getPlaceholderProviders returns only non-connected providers", () => {
    const placeholders = getPlaceholderProviders(catalog).map((p) => p.id);
    expect(placeholders).toContain("salesforce");
    expect(placeholders).toContain("pipedrive");
    expect(placeholders).toContain("jira");
    expect(placeholders).not.toContain("hubspot");
    expect(placeholders).not.toContain("slack");
    expect(placeholders).not.toContain("xero");
  });
  it("getRealProviders returns only connected providers", () => {
    const real = getRealProviders(catalog).map((p) => p.id);
    expect(real.sort()).toEqual(["hubspot", "slack", "xero"].sort());
  });
  it("placeholder + real sets are disjoint and exhaustive over the catalog", () => {
    const placeholders = getPlaceholderProviders(catalog).map((p) => p.id);
    const real = getRealProviders(catalog).map((p) => p.id);
    const all = catalog.map((p) => p.id);
    expect([...placeholders, ...real].sort()).toEqual(all.sort());
  });
});

describe("placeholder copy — owner-approved, no fabricated claims", () => {
  it("exposes the exact owner contact email", () => {
    expect(PLACEHOLDER_CONTACT_EMAIL).toBe("electric.vortexz@gmail.com");
  });
  it("uses the exact in-development status copy", () => {
    expect(PLACEHOLDER_STATUS_COPY).toBe("In development — we're working on it.");
  });
  it("contact line contains the email and never claims Connected", () => {
    expect(PLACEHOLDER_CONTACT_COPY).toContain("Contact us at electric.vortexz@gmail.com");
    expect(PLACEHOLDER_CONTACT_COPY.toLowerCase()).not.toContain("connected");
    expect(PLACEHOLDER_STATUS_COPY.toLowerCase()).not.toContain("connected");
  });
  it("real set is non-empty and contains only canonical ids", () => {
    expect(REAL_INTEGRATION_PROVIDERS.size).toBeGreaterThan(10);
    expect(REAL_INTEGRATION_PROVIDERS.has("salesforce")).toBe(false);
  });
});
