import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * Integration explorer tier segmentation (canonical source).
 *
 * The public integrations pages MUST segment into "Live now" vs "In development /
 * Roadmap" driven by ONE canonical source — the `status` field in
 * src/content/integrations.ts (resolved via isLiveIntegration). Roadmap-only
 * integrations must never be presented as a working/live connection, and the
 * explorer must offer a "Notify me when live" capture for them that reuses the
 * wired capture-lead (SendGrid) pattern.
 */
function readRepoFile(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

describe("Integration tiers — canonical source (integrations.ts status)", () => {
  const src = readRepoFile("src/content/integrations.ts");
  it("declares the canonical live/roadmap status field", () => {
    expect(src).toContain("status?: \"live\" | \"roadmap\"");
    expect(src).toContain("isLiveIntegration");
  });
  it("marks the verified live providers as live in the catalog", () => {
    // Google productivity, Microsoft Office, accounting/CRM anchors.
    for (const id of [
      "google-docs", "google-sheets", "google-drive", "google-slides", "google-calendar",
      "microsoft-word", "microsoft-excel", "microsoft-powerpoint",
      "xero", "hubspot",
    ]) {
      // assert that entry carries status: "live" (id line followed by status line)
      const re = new RegExp(`id: "${id}",\\n\\s*status: "live",`);
      expect(re.test(src), `expected ${id} to be marked status: "live"`).toBe(true);
    }
  });
  it("does NOT mark placeholder/roadmap ERPs or CRMs as live (fail-closed)", () => {
    for (const id of ["sap", "oracle-netsuite", "salesforce", "zoho-crm", "pipedrive", "workday", "quickbooks-enterprise"]) {
      const re = new RegExp(`id: "${id}",\\n\\s*status: "live",`);
      expect(re.test(src), `${id} must not be marked live`).toBe(false);
    }
  });
});

describe("Integration explorer page reads the canonical source", () => {
  const src = readRepoFile("src/lazy/integrations.index.page.tsx");
  it("derives tiers via isLiveIntegration (no hardcoded per-page divergence)", () => {
    expect(src).toContain("isLiveIntegration");
    expect(src).toContain("const liveIntegrations = filteredIntegrations.filter(isLiveIntegration)");
    expect(src).toContain("const roadmapIntegrations = filteredIntegrations.filter((i) => !isLiveIntegration(i))");
  });
  it("renders two clearly labelled tiers", () => {
    expect(src).toContain("Live now");
    expect(src).toContain("In development / Roadmap");
  });
  it("keeps the existing honest disclosure intact", () => {
    expect(src).toContain("Live today you can connect Xero, Slack, Google, Microsoft 365, HubSpot, and DocuSign");
    expect(src).toContain("QuickBooks is in development");
  });
  it("provides a Notify-me-when-live capture that reuses capture-lead (SendGrid)", () => {
    expect(src).toContain("Notify me when live");
    expect(src).toContain("/api/tools/capture-lead");
    expect(src).toContain("notify-when-live");
  });
});

describe("Integration detail page shows the status badge canonically", () => {
  const src = readRepoFile("src/components/IntegrationPage.tsx");
  it("uses isLiveIntegration to render Live-now vs In-development badge", () => {
    expect(src).toContain("isLiveIntegration");
    expect(src).toContain("Live now");
    expect(src).toContain("In development / Roadmap");
  });
});
