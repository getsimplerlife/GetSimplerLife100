/**
 * provider-placeholders-render.test.tsx — SSR rendering guard for the portal
 * integrations page: placeholder cards are shown for in-development providers
 * and NEVER for providers with real connected credentials.
 *
 * The page's own grid excludes CRM/ERP/Accounting categories (they have their
 * own Connection Pack pages), so expectations are computed from the catalog
 * with the same exclusion rules. Badge counts must partition the rendered
 * catalog exactly: every rendered card shows exactly one status badge.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PROVIDERS } from "../data/providers";
import {
  isPlaceholderProvider,
  PLACEHOLDER_STATUS_COPY,
  PLACEHOLDER_CONTACT_EMAIL,
} from "../lib/provider-placeholders";
import ConnectedServices from "../routes/portal.integrations.index";

// Same exclusion the page applies (see CRM_ERP_EXCLUDE in the route file).
const EXCLUDED_CATEGORIES = ["CRM", "ERP", "Accounting"];
const isExcluded = (category: string | undefined) =>
  EXCLUDED_CATEGORIES.some((c) => (category || "").toLowerCase().includes(c.toLowerCase()));

const renderedProviders = PROVIDERS.filter((p) => !isExcluded(p.category));
const expectedPlaceholders = renderedProviders.filter((p) => isPlaceholderProvider(p.id));
const expectedConnected = renderedProviders.filter((p) => !isPlaceholderProvider(p.id));

describe("portal integrations page — placeholder rendering", () => {
  it("renders the owner-approved placeholder copy for in-development providers", () => {
    const html = renderToString(createElement(ConnectedServices));
    // React escapes the apostrophe in SSR output, so match the stable prefix.
    expect(html).toContain("In development");
    expect(html).toContain("we&#x27;re working on it.");
    expect(html).toContain(PLACEHOLDER_CONTACT_EMAIL);
    expect(html).toContain("In Development");
  });

  it("renders exactly one placeholder card per in-development provider in the rendered grid", () => {
    const html = renderToString(createElement(ConnectedServices));
    const statusCount = html.split(PLACEHOLDER_STATUS_COPY.replace("'", "&#x27;")).length - 1;
    expect(expectedPlaceholders.length).toBeGreaterThan(100); // sanity: mostly in-development
    expect(statusCount).toBe(expectedPlaceholders.length);
  });

  it("badge counts partition the rendered catalog: placeholders never claim Connected", () => {
    const html = renderToString(createElement(ConnectedServices));
    const placeholderBadges = html.split(">In Development<").length - 1;
    const availableBadges = html.split(">Available<").length - 1;
    expect(expectedConnected.length).toBeGreaterThan(0);
    // Every connected provider renders the "Available" badge exactly once —
    // the placeholder copy never appears in their cards.
    expect(availableBadges).toBe(expectedConnected.length);
    // Every placeholder renders the "In Development" badge exactly once.
    expect(placeholderBadges).toBe(expectedPlaceholders.length);
    // The two badge types partition every rendered card exactly.
    expect(placeholderBadges + availableBadges).toBe(renderedProviders.length);
  });

  it("placeholder copy appears once per card and the contact line is mailto", () => {
    const html = renderToString(createElement(ConnectedServices));
    // Every placeholder card links to the owner-specified email.
    expect(html.split(`mailto:${PLACEHOLDER_CONTACT_EMAIL}`).length - 1).toBe(expectedPlaceholders.length);
  });
});
