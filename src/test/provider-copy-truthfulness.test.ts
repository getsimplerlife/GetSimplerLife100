import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Provider-copy truthfulness (owner-mandated): the live purchase/connect
 * surface must reference ONLY providers we can actually connect to today, with
 * everything else explicitly marked "in development". We audit at the source
 * level (copy only — these pages are the public purchase/connect surface).
 *
 * Verified live providers: Xero, Slack, Google, Microsoft 365, HubSpot,
 * DocuSign. QuickBooks = code-ready but NOT yet live → must be marked
 * "in development". Everything else is NOT live and must never be advertised
 * as connectable without an "in development" marker.
 */
function readRepoFile(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

// Non-live provider names that must NEVER appear without an "in development"
// marker in the purchase/connect copy we audit.
const NON_LIVE_PROVIDERS = [
  "salesforce",
  "netsuite",
  "shopify",
  "zoho",
  "sap",
  "bamboohr",
  "workday",
  "linkedin",
  "hootsuite",
  "google maps",
  "onfleet",
  "zendesk",
  "intercom",
  "freshdesk",
  "pipedrive",
  "marketo",
  "coupa",
  "adp",
  "gusto",
  "airtable",
  "jira",
  "servicenow",
  "monday",
];

describe("Marketplace Connection Packs — only real providers connectable now", () => {
  const src = readRepoFile("src/lazy/portal.marketplace.index.page.tsx");
  const crmDesc = src.slice(
    src.indexOf("name: \"CRM Connection Pack\""),
    src.indexOf("category: \"Operations\" as const,", src.indexOf("CRM Connection Pack"))
  );
  // Search for the ERP name only from the name literal to avoid matching the
  // "ERP Connection Packs" mention in the file's module comment above it.
  const erpStart = src.indexOf("name: \"ERP Connection Pack\"");
  const erpDesc = src.slice(
    erpStart,
    src.indexOf("category: \"Operations\" as const,", src.indexOf("ERP Connection Pack", erpStart))
  );

  it("CRM pack lists only HubSpot as connectable now (no Salesforce/Zoho/Pipedrive as available)", () => {
    expect(crmDesc.toLowerCase()).toContain("connect hubspot today");
    // Non-live providers are only allowed with an in-development marker.
    for (const p of NON_LIVE_PROVIDERS) {
      if (crmDesc.toLowerCase().includes(p)) {
        expect(crmDesc.toLowerCase(), `"${p}" must be marked in development in CRM pack`).toContain("in development");
      }
    }
  });

  it("ERP pack lists only Xero as connectable now and QuickBooks as in development", () => {
    expect(erpDesc.toLowerCase()).toContain("connect xero today");
    expect(erpDesc.toLowerCase()).toContain("quickbooks");
    expect(erpDesc.toLowerCase()).toContain("in development");
    for (const p of NON_LIVE_PROVIDERS) {
      if (erpDesc.toLowerCase().includes(p)) {
        expect(erpDesc.toLowerCase(), `"${p}" must be marked in development in ERP pack`).toContain("in development");
      }
    }
  });

  it("does not claim any non-live provider as connectable-now", () => {
    expect(/Connect (Salesforce|Zoho|Pipedrive|NetSuite|SAP|Sage)/i.test(src)).toBe(false);
  });
});

describe("Pricing AI-employee agent cards — non-live providers only with an in-development marker", () => {
  const src = readRepoFile("src/routes/pricing.tsx");
  const agentsSection = src.slice(src.indexOf("const agents ="), src.indexOf("const builderTiers ="));
  const lines = agentsSection.split("\n");

  it("every line naming a non-live provider also carries an in-development marker", () => {
    const offending: string[] = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      for (const p of NON_LIVE_PROVIDERS) {
        // "sap" as a bare word (avoid matching inside unrelated words).
        const re = new RegExp(`(^|[^a-z])${p}([^a-z]|$)`, "i");
        if (re.test(lower) && !lower.includes("in development")) {
          offending.push(`${p} on line: ${line.trim()}`);
        }
      }
    }
    expect(offending).toEqual([]);
  });

  it("agent descriptions name only real providers as working (Xero, Slack, Google, Microsoft, HubSpot, DocuSign)", () => {
    // HubSpot and Xero are the CRM/ERP anchors claimed as live; others appear only
    // as in-development. Spot-check the headline claims are truthful.
    expect(src).toContain("syncs to Xero accounting");
    expect(src).toContain("Keeps HubSpot contacts, deals, and pipelines in sync");
    expect(src).toContain("Gmail, Microsoft Outlook, and Slack");
    expect(src).toContain("Google Sheets, Microsoft Excel, and HubSpot");
  });

  it("does not change price/Stripe links (no $ values invented or removed)", () => {
    // Assert the 17 agent prices are still present.
    for (const price of [950, 2000, 1800, 499, 750, 1200, 850, 1500]) {
      expect(src).toContain(`price: ${price}`);
    }
    // Stripe checkout links preserved.
    expect((src.match(/https:\/\/buy\.stripe\.com/g) || []).length).toBeGreaterThanOrEqual(17);
  });
});

describe("Portal integrations page — honest provider counts", () => {
  const src = readRepoFile("src/lazy/portal.integrations.index.page.tsx");

  it("no longer advertises the full catalog count as available platforms", () => {
    // The 179/180 inflated claim is gone; we now disclose real-vs-in-development.
    expect(src).not.toContain("AVAILABLE PROVIDERS");
    expect(src).not.toMatch(/of 179/);
    expect(src).not.toMatch(/179 platforms/);
  });

  it("discloses connectable-now and in-development counts", () => {
    expect(src).toContain("connectable now");
    expect(src).toContain("more in development");
  });

  it("drives the connections denominator from the real (non-placeholder) provider set", () => {
    expect(src).toContain("getRealProviders");
    expect(src).toContain("connectableNowCount");
  });
});

describe("Public integrations explorer — no inflated capability claims", () => {
  const src = readRepoFile("src/lazy/integrations.index.page.tsx");

  it("does not claim all 175+ catalog apps are fully supported / working", () => {
    expect(src).not.toContain("over 175 integrated applications");
    expect(src).not.toContain("fully supported!");
    expect(src).not.toContain("CONNECTOR ACTIVE");
  });

  it("discloses live providers and in-development status honestly", () => {
    expect(src).toContain("Live today you can connect Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign");
    expect(src).toContain("QuickBooks is in development");
  });
});

describe("Footer — no dead Privacy/Terms links", () => {
  const src = readRepoFile("src/components/Footer.tsx");

  it("Privacy Policy and Terms are wired to real routes, not href='#'", () => {
    expect(src).toContain('to="/privacy"');
    expect(src).toContain('to="/terms"');
    expect(src).not.toContain("Privacy Policy</a>");
    expect(src).not.toContain("Terms of Service</a>");
    expect(src).not.toMatch(/href="#"[\s]*>Privacy Policy/);
    expect(src).not.toMatch(/href="#"[\s]*>Terms of Service/);
  });
});

describe("Privacy & Terms pages — truthful, real content, no dead links", () => {
  it("privacy.tsx and terms.tsx exist and include the owner contact", () => {
    expect(existsSync(join(process.cwd(), "src/routes/privacy.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "src/routes/terms.tsx"))).toBe(true);
    expect(readRepoFile("src/routes/privacy.tsx")).toContain("electric.vortexz@gmail.com");
    expect(readRepoFile("src/routes/terms.tsx")).toContain("electric.vortexz@gmail.com");
  });
});

describe("site-meta — public SEO copy is truthful about integrations", () => {
  const src = readRepoFile("src/lib/site-meta.ts");

  it("pricing and integrations meta no longer claim 180+ integrations", () => {
    expect(src).not.toContain("180+ integrations");
    const pricingMeta = src.slice(src.indexOf('"/pricing"'), src.indexOf('"/register"'));
    expect(pricingMeta).toContain("Live integrations: Xero, Slack, Google, Microsoft, HubSpot, DocuSign");
  });

  it("has SEO entries for /privacy and /terms", () => {
    expect(src).toContain('"/privacy"');
    expect(src).toContain('"/terms"');
  });
});
